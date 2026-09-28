import { resolveMissingPolicy } from '@opencraw/core'
import type { FieldSpec, FieldTrace, InputRecipe, MappingRule, OutputRecipe, Step } from '@opencraw/core'
import { lastRunOf } from '../sample-run'
import type { LastRunCache, SampleRunRecord, SampleRunRejected, SampleStepSummary } from '../sample-run'
import type { WhyTarget, WhyView } from '../studio-api'
import { hintFor } from './item-hint.algorithm'
import { buildWhySentence } from './why-sentence.mapper'
import type { WhyStepFact } from './why-sentence.mapper'

/**
 * Explains one missing or rejected value from a recipe's last sample run
 * (issue #92's Why? tab, studio plan §4.4): the mapping trace and scope
 * snapshot `run-sample` kept, the recipe's own rule and field for the
 * missing-value policy, and the step that bound the value's source id — did
 * it run, was it skipped, or does no step in this recipe bind it at all.
 *
 * @param folder - The workspace folder (to re-read the recipe pair: the last
 *   run only kept the run's own data, not the recipe text, and a save may
 *   have happened since).
 * @param cache - The server's last-run cache (`sample-run`'s `LastRunCache`).
 * @param loadPair - Loads the input/output recipe pair; injected so this
 *   stays testable without a real workspace folder (`sample-run`'s
 *   `loadRecipePair` in production).
 * @param target - What was clicked.
 * @returns The explanation.
 * @throws Error when no sample run has finished for this recipe yet, or the target does not name a real record/field.
 */
export async function explainWhy (folder: string, cache: LastRunCache, loadPair: (folder: string, recipeId: string) => Promise<{ input: InputRecipe, output: OutputRecipe }>, target: WhyTarget): Promise<WhyView> {
  const entry = lastRunOf(cache, target.recipeId)
  if (entry === undefined) throw new Error(`no finished sample run for "${target.recipeId}" yet — run a sample first`)
  const { input, output } = await loadPair(folder, target.recipeId)

  return target.kind === 'rejected'
    ? explainRejected(target.recipeId, input, output, entry.result.rejectedRecords, entry.result.steps, target.rejectedIndex)
    : explainMissing(target.recipeId, input, output, entry.result.records, entry.result.steps, target.recordIndex, target.field)
}

function explainRejected (recipeId: string, input: InputRecipe, output: OutputRecipe, rejectedRecords: SampleRunRejected[], steps: SampleStepSummary[], index: number): WhyView {
  const rejected = rejectedRecords[index]
  if (rejected === undefined) throw new Error(`no rejected record at index ${index}`)
  const rule = ruleFor(input.mapping, rejected.field)
  const field = fieldFor(output.fields, rejected.field)
  const policy = field === undefined ? undefined : resolveMissingPolicy(field, output, rule)
  const boundId = boundIdOf(rule)
  const step = boundId === undefined ? undefined : findStep(input.steps, boundId, steps)
  const hint = hintFor(rejected.scope, boundId)
  const sentence = buildWhySentence({ field: rejected.field, outcome: 'rejected', reason: rejected.reason, policy, boundId, step, hint })

  return { sentence, field: rejected.field, recipeId, outcome: 'rejected', reason: rejected.reason, policy, stepPath: step?.path }
}

function explainMissing (recipeId: string, input: InputRecipe, output: OutputRecipe, records: SampleRunRecord[], steps: SampleStepSummary[], index: number, field: string): WhyView {
  const record = records[index]
  if (record === undefined) throw new Error(`no record at index ${index}`)
  const trace: FieldTrace | undefined = record.mapping?.[field]
  const rule = ruleFor(input.mapping, field)
  const fieldSpec = fieldFor(output.fields, field)
  const policy = fieldSpec === undefined ? undefined : resolveMissingPolicy(fieldSpec, output, rule)
  const boundId = boundIdOf(rule)
  const step = boundId === undefined ? undefined : findStep(input.steps, boundId, steps)
  const hint = hintFor(record.scope, boundId)
  const sentence = buildWhySentence({ field, outcome: 'missing', policy, trace, boundId, step, hint })

  return { sentence, field, recipeId, outcome: 'missing', policy, stepPath: step?.path }
}

/**
 * The rule bound to one output field path: a direct match on `input.mapping`
 * (its keys are themselves dotted target paths — `stock.inStock`, `tax` —
 * `map-record.use-case.ts` writes each with `setPath`), or, for a path
 * inside an `each` list's items (`variants[1].size`), the item's own rule
 * inside the list rule's `fields`. Only one level of `each` nesting is
 * resolved; a field inside a nested `each` (an `each` of `each`) is not —
 * out of this phase's scope.
 */
function ruleFor (mapping: Record<string, MappingRule>, path: string): MappingRule | undefined {
  const direct = mapping[path]
  if (direct !== undefined) return direct
  const match = /^([^[]+)\[\d+\]\.(.+)$/.exec(path)
  if (match === null) return undefined
  const parent = mapping[match[1]]

  return parent !== undefined && 'each' in parent ? parent.fields[match[2]] : undefined
}

/** The output field spec at one dotted path (`stock.inStock`, `variants[1].size`), walking `object`/`array` members the same way `map-record.use-case.ts` builds them. */
function fieldFor (fields: Record<string, FieldSpec>, path: string): FieldSpec | undefined {
  let current: Record<string, FieldSpec> | undefined = fields
  let field: FieldSpec | undefined
  for (const token of path.split('.')) {
    const match = /^([^[]+)(\[\d+\])?$/.exec(token)
    if (match === null || current === undefined) return undefined
    field = current[match[1]]
    if (field === undefined) return undefined
    current = match[2] === undefined ? field.fields : field.items?.fields
  }

  return field
}

/** The leading id a `from` rule reads (`item` of `item.description`, `price` of `price`); `undefined` for an `each` rule, a `.` (self), or a rule this run found nothing to say about. */
function boundIdOf (rule: MappingRule | undefined): string | undefined {
  if (rule === undefined || !('from' in rule)) return undefined
  const first = Array.isArray(rule.from) ? rule.from[0] : rule.from
  const match = /^([A-Z_][\w-]*)/i.exec(first)

  return match?.[1]
}

/** Enough of a step to walk its body generically (`forEach`/`paginate`/`if`), without importing every step-type shape this leaf-ish lookup does not need. */
interface StepLike { id?: string, as?: string, type?: string, steps?: unknown[], else?: unknown[] }

/**
 * Finds the step of the recipe whose `id` or `as` (a `forEach`'s loop
 * variable) is `boundId`, walking into `forEach`/`paginate`/`if` bodies the
 * same way `scope-outline`'s outline does, and reports how it went over the
 * whole sample run from `stepSummaries` (`sample-run`'s per-path summary).
 *
 * @returns `undefined` only when nothing in `steps` looks like a step at all; a `boundId` that names no real step still gets a fact, with `outcome: 'not-found'`.
 */
function findStep (steps: Step[], boundId: string, stepSummaries: SampleStepSummary[]): WhyStepFact | undefined {
  const found = search(steps, boundId, 'steps')
  if (found === undefined) return { path: '', stepType: '', outcome: 'not-found' }
  const summary = stepSummaries.find(entry => entry.path === found.path)

  return { path: found.path, stepType: found.step.type ?? 'unknown', stepId: found.step.id, outcome: summary?.outcome ?? 'ran', error: summary?.error }
}

function search (steps: StepLike[], boundId: string, prefix: string): { path: string, step: StepLike } | undefined {
  for (const [index, step] of steps.entries()) {
    const path = `${prefix}.${index}`
    if (step.id === boundId || step.as === boundId) return { path, step }
    if (step.steps !== undefined) {
      const nested = search(step.steps as StepLike[], boundId, `${path}.steps`)
      if (nested !== undefined) return nested
    }
    if (step.else !== undefined) {
      const nested = search(step.else as StepLike[], boundId, `${path}.else`)
      if (nested !== undefined) return nested
    }
  }

  return undefined
}
