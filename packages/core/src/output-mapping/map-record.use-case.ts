import type { HookRegistry } from '../hooks'
import type { FieldSpec, InputRecipe, MappingRule, OutputRecipe } from '../recipe-schema'
import { getPath, setPath } from '../template'
import { applyTransformChain } from '../transformation'
import type { TransformContext } from '../transformation'
import { coerceValue } from './coerce-field.mapper'
import type { CoercionError } from './coerce-field.mapper'
import { defaultValue } from './field-default.validator'
import { generatedValue } from './generated-field.mapper'
import type { MappingTrace } from './mapping-trace.model'
import { MappingFailedError, RecordRejectedError } from './mapping.error'
import { isMissing, resolveMissingPolicy } from './missing-value.policy'
import { validateField } from './output-field.validator'
import { recordKey } from './output-record.model'
import type { OutputRecord } from './output-record.model'

/** Everything needed to turn one emitted scope snapshot into a record. */
export interface MapRecordRequest {
  snapshot:   Record<string, unknown>
  input:      InputRecipe
  output:     OutputRecipe
  hooks:      HookRegistry
  /** The page URL at emit time. */
  url:        string
  emittedAt?: string
  log?:       TransformContext['log']
  /** Filled with each mapped field's source value and its value after each transform. */
  trace?:     MappingTrace
}

/**
 * Maps an emitted scope snapshot to a validated output record: resolves every
 * mapping rule, runs its transform chain, fills generated fields, then coerces
 * and validates each output field and applies the missing-value policy.
 *
 * @param request - The snapshot and the recipes.
 * @returns The record.
 * @throws RecordRejectedError when a field's policy is `skip-record`.
 * @throws MappingFailedError when a field's policy is `fail`, or a transform throws.
 */
export async function mapRecord (request: MapRecordRequest): Promise<OutputRecord> {
  const { snapshot, input, output } = request
  const emittedAt = request.emittedAt ?? new Date().toISOString()
  const context: TransformContext = {
    recipeId: input.id,
    scope:    snapshot,
    lookup:   path => getPath(snapshot, path),
    hooks:    request.hooks,
    baseUrl:  request.url,
    log:      request.log ?? (() => {}),
  }

  const raw: Record<string, unknown> = {}
  const rulesByTarget = new Map<string, MappingRule>()
  for (const [target, rule] of Object.entries(input.mapping)) {
    rulesByTarget.set(target, rule)
    const value = await resolveRule(rule, snapshot, snapshot, context, target, request.trace)
    if (value !== undefined) setPath(raw, target, value)
  }
  for (const [name, field] of Object.entries(output.fields)) {
    if (field.generated !== undefined) raw[name] = generatedValue(field.generated, { recipeId: input.id, url: request.url, emittedAt })
  }

  const data = finishObject(raw, output.fields, output, { path: '', key: '', rules: key => rulesByTarget.get(key) })
  const keyFields = Object.entries(output.fields).filter(([, field]) => field.key === true).map(([name]) => name)

  return { data, key: recordKey(data, keyFields), source: { recipeId: input.id, url: request.url, emittedAt } }
}

/**
 * @param target - The rule's target, for errors (`variants.size`).
 * @param trace - Filled with the field's source and each transform's value, when given.
 * @param traceKey - Where in `trace` (`variants[1].size` for an item of `each`).
 */
async function resolveRule (rule: MappingRule, scope: Record<string, unknown>, self: unknown, context: TransformContext, target: string, trace?: MappingTrace, traceKey = target): Promise<unknown> {
  try {
    if ('each' in rule) return await resolveEach(rule, scope, context, target, trace, traceKey)
    const sources = Array.isArray(rule.from) ? rule.from : [rule.from]
    const values = sources.map(source => (source === '.' ? self : getPath(scope, source)))
    const value = Array.isArray(rule.from) ? values : values[0]
    const transforms = rule.transform ?? []
    if (trace === undefined) return await applyTransformChain(value, transforms, context)
    // One transform at a time, the way the chain applies them, to keep each intermediate value.
    const steps: MappingTrace[string]['steps'] = []
    trace[traceKey] = { from: value, steps }
    let current = value
    for (const transform of transforms) {
      current = await applyTransformChain(current, [transform], context)
      steps.push({ op: transform.op, value: current })
    }

    return current
  } catch (error) {
    if (error instanceof MappingFailedError || error instanceof RecordRejectedError) throw error
    // A rule that says skip-record means "this record is not worth keeping without
    // this field": a transform that cannot produce it drops the record, not the recipe.
    if (rule.onMissing === 'skip-record') throw new RecordRejectedError(target, (error as Error).message)
    throw new MappingFailedError(target, (error as Error).message, { cause: error })
  }
}

async function resolveEach (rule: Extract<MappingRule, { each: string }>, scope: Record<string, unknown>, context: TransformContext, target: string, trace: MappingTrace | undefined, traceKey: string): Promise<unknown[] | undefined> {
  const list = getPath(scope, rule.each)
  if (list === undefined || list === null) return undefined
  if (!Array.isArray(list)) throw new MappingFailedError(target, `"${rule.each}" is not a list`)
  const items: unknown[] = []
  for (const [index, item] of list.entries()) {
    const itemScope = itemAsScope(item)
    const built: Record<string, unknown> = {}
    const nestedRules = Object.entries(rule.fields)
    for (const [name, nested] of nestedRules) {
      const value = await resolveRule(nested, itemScope, item, { ...context, scope: itemScope, lookup: itemLookup(itemScope, context.lookup) }, `${target}.${name}`, trace, `${traceKey}[${index}].${name}`)
      if (value !== undefined) setPath(built, name, value)
    }
    items.push(built)
  }

  return items
}

/**
 * What a transform inside `each.fields` sees: the item first, then the scope
 * the `each` ran in, so a `lookup` table or a `template` path extracted once per
 * record (before the loop) stays reachable from every item. `from` stays
 * relative to the item.
 *
 * @param itemScope - The current item.
 * @param outer - The enclosing lookup: the record's, or an outer item's.
 * @returns The chained lookup.
 */
function itemLookup (itemScope: Record<string, unknown>, outer: TransformContext['lookup']): TransformContext['lookup'] {
  return (path) => {
    const own = getPath(itemScope, path)

    return own === undefined ? outer(path) : own
  }
}

function itemAsScope (item: unknown): Record<string, unknown> {
  return typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {}
}

/**
 * Where a value sits in the record: its path in messages (`variants[1].size`), and how to find the mapping
 * rule that made it. Rules are looked up by `key`, the dotted path within the current rule scope: the
 * mapping itself at the top, an `each` rule's `fields` inside one of its items.
 */
interface Place {
  path:  string
  key:   string
  rules: (key: string) => MappingRule | undefined
}

function memberOf (place: Place, name: string): Place {
  return { path: place.path === '' ? name : `${place.path}.${name}`, key: place.key === '' ? name : `${place.key}.${name}`, rules: place.rules }
}

/**
 * An item of a list. Inside an `each` rule, its members' rules are the rule's `fields`; the item itself, and a
 * scalar item, answer to the list's rule.
 */
function itemOf (place: Place, index: number): Place {
  const rule = place.rules(place.key)
  const rules = rule !== undefined && 'each' in rule ? (key: string) => (key === '' ? rule : rule.fields[key]) : () => rule

  return { path: `${place.path}[${index}]`, key: '', rules }
}

function finishObject (raw: Record<string, unknown>, fields: Record<string, FieldSpec>, output: OutputRecipe, place: Place): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [name, field] of Object.entries(fields)) {
    const value = finishField(raw[name], field, output, memberOf(place, name))
    if (value !== undefined) data[name] = value
  }

  return data
}

/**
 * Coerces and validates one field, then applies the missing-value policy when it has no value. The members
 * of an `object` and the items of an `array` are finished one by one, so a member of an `each` item gets its
 * own policy and validation, reported at its index (`variants[1].size`).
 */
function finishField (rawValue: unknown, field: FieldSpec, output: OutputRecipe, place: Place): unknown {
  const rule = place.rules(place.key)
  const value = shape(rawValue, field, output, place)
  const emptyObject = field.type === 'object' && !isMissing(value) && Object.keys(value as Record<string, unknown>).length === 0
  if (!emptyObject && !isMissing(value)) {
    const problems = validateField(value, field)
    if (problems.length > 0) return reject(field, place.path, problems.join('; '), rule, output)

    return value
  }
  const policy = resolveMissingPolicy(field, output, rule)
  if (policy === 'default') return defaultOf(field, place.path)
  if (policy === 'null') return field.nullable === true || field.required !== true ? null : reject(field, place.path, 'missing', rule, output, 'fail')

  return reject(field, place.path, 'missing', rule, output, policy)
}

function shape (rawValue: unknown, field: FieldSpec, output: OutputRecipe, place: Place): unknown {
  if (field.type === 'object' && field.fields !== undefined && isRecord(rawValue)) return finishObject(rawValue, field.fields, output, place)
  const items = field.items
  if (rawValue !== undefined && rawValue !== null && items !== undefined && field.type === 'array') {
    const list = Array.isArray(rawValue) ? rawValue : [rawValue]

    return list.map((entry, index) => finishItem(entry, items, field, output, itemOf(place, index)))
  }

  return coerceOrReject(rawValue, field, place.path, place.rules(place.key), output)
}

/**
 * One item of a list: an object's members are finished like fields; a scalar is coerced and validated, a
 * problem following the list field's policy, and is `null` when missing.
 */
function finishItem (entry: unknown, spec: FieldSpec, list: FieldSpec, output: OutputRecipe, place: Place): unknown {
  if (spec.type === 'object' && spec.fields !== undefined && isRecord(entry)) return finishObject(entry, spec.fields, output, place)
  const rule = place.rules('')
  const value = coerceOrReject(entry, spec, place.path, rule, output, list)
  if (value === undefined || value === null) return null
  const problems = isMissing(value) ? [] : validateField(value, spec)
  if (problems.length > 0) return reject(list, place.path, problems.join('; '), rule, output)

  return value
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The field's `default`, coerced like a mapped value; a field whose policy is `default` without one fails. */
function defaultOf (field: FieldSpec, path: string): unknown {
  if (field.default === undefined) throw new MappingFailedError(path, 'missing, and the policy is "default" but the field has no default')
  try {
    return defaultValue(field, path)
  } catch (error) {
    const { path: at, reason } = error as CoercionError
    throw new MappingFailedError(at, `default: ${reason}`, { cause: error })
  }
}

/**
 * A value that cannot be coerced follows the missing-value precedence (rule,
 * field, `default`, recipe): `skip-record` drops the record, anything else
 * stops the recipe.
 *
 * @param policyField - The field whose policy applies: the list's, for one of its scalar items.
 */
function coerceOrReject (rawValue: unknown, field: FieldSpec, path: string, rule: MappingRule | undefined, output: OutputRecipe, policyField = field): unknown {
  try {
    return coerceValue(rawValue, field, path)
  } catch (error) {
    // The coercion error names its own path, deeper for a member (`price.amount`): said once, not twice.
    const { path: at, reason } = error as CoercionError
    if (resolveMissingPolicy(policyField, output, rule) === 'skip-record') throw new RecordRejectedError(at, reason)
    throw new MappingFailedError(at, reason, { cause: error })
  }
}

function reject (field: FieldSpec, path: string, reason: string, rule: MappingRule | undefined, output: OutputRecipe, policy = resolveMissingPolicy(field, output, rule)): never {
  if (policy === 'skip-record') throw new RecordRejectedError(path, reason)
  throw new MappingFailedError(path, reason)
}
