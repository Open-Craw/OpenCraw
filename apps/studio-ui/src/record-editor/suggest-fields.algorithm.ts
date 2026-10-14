import { FIELD_NAME_PATTERN } from './field-spec.model'
import type { FieldSpecJson, FromRuleJson, MappingRuleJson } from './field-spec.model'

/** One output field the Record tab proposes for a value the steps read and no field uses yet. */
export interface FieldSuggestion {
  /** The step id the field would read (its pill). */
  source: string
  /** The proposed field name: the id made a legal, unused field name. */
  name:   string
  field:  FieldSpecJson
  rule:   FromRuleJson
  /** Why this type, in a few words (a tooltip). */
  reason: string
}

interface Typed {
  type:       string
  reason:     string
  items?:     FieldSpecJson
  transform?: { op: string }[]
}

type StepJson = Record<string, unknown>

/** The attributes a link or an image source is taken from. */
const LINK_TAKES: ReadonlySet<string> = new Set(['attr:href', 'attr:src', 'attr:data-src'])

/** Words in a step id that say what its value is. First match wins, so a more specific kind comes first. */
const WORD_TYPES: readonly (readonly [readonly string[], Typed])[] = [
  [['url', 'link', 'href', 'website', 'homepage', 'image', 'img', 'photo', 'thumbnail', 'src'], { type: 'url', reason: 'its name says a link' }],
  [['datetime', 'timestamp'], { type: 'datetime', reason: 'its name says a moment in time' }],
  [['date', 'day', 'published', 'created', 'updated', 'released', 'expires', 'expiry', 'until', 'since'], { type: 'date', reason: 'its name says a date' }],
  [['available', 'availability', 'active', 'enabled', 'instock', 'is', 'has'], { type: 'boolean', reason: 'its name says yes or no' }],
  [['qty', 'quantity', 'count', 'pages', 'year', 'age', 'rank', 'position', 'votes', 'reviews'], { type: 'integer', reason: 'its name says a whole number' }],
  [['price', 'cost', 'amount', 'total', 'fee', 'discount', 'salary', 'rate', 'rating', 'score', 'weight', 'height', 'width', 'length', 'percent', 'sconto'], { type: 'number', reason: 'its name says an amount' }],
]

/**
 * The output fields to propose for what a recipe's steps read: every `extract`
 * (and `set`) with an id that no mapping rule uses yet and that no `forEach`
 * loops over. Each gets a legal, unused name, a type guessed from how the value
 * was taken and from the words in its id, and the rule that reads it.
 *
 * @param input - The input recipe's parsed JSON (possibly mid-edit).
 * @param fields - The output recipe's fields so far.
 * @param mapping - The input recipe's mapping so far.
 * @returns The proposals, in the order the steps read them.
 */
export function suggestFields (input: unknown, fields: Record<string, FieldSpecJson>, mapping: Record<string, MappingRuleJson>): FieldSuggestion[] {
  const steps = flatten(stepsOf(input))
  const looped = new Set(steps.flatMap(step => (typeof step.over === 'string' ? [step.over] : [])))
  const used = mappedIds(mapping)
  const taken = new Set(Object.keys(fields))
  const suggestions: FieldSuggestion[] = []
  const seen = new Set<string>()
  for (const step of steps) {
    const id = step.id
    if (typeof id !== 'string' || id === '' || !isReadStep(step) || looped.has(id) || used.has(id) || seen.has(id)) continue
    seen.add(id)
    const typed = inferType(id, step)
    const name = freeName(id, taken)
    taken.add(name)
    suggestions.push({
      source: id,
      name,
      field:  { type: typed.type, ...(typed.items !== undefined && { items: typed.items }) },
      rule:   { from: id, ...(typed.transform !== undefined && { transform: typed.transform }) },
      reason: typed.reason,
    })
  }

  return suggestions
}

/** The type a value's id and way of being read suggest. Never `currency` (it fails without a code); `number` reads a price with a symbol in it. */
function inferType (id: string, step: StepJson): Typed {
  if (step.many === true) return { type: 'array', items: { type: 'string' }, reason: 'it reads every match, a list' }
  const take = typeof step.take === 'string' ? step.take : undefined
  if (take !== undefined && LINK_TAKES.has(take)) return { type: 'url', transform: [{ op: 'absoluteUrl' }], reason: `it takes ${take}, a link (made absolute)` }
  const words = wordsOf(id)
  for (const [keys, typed] of WORD_TYPES) {
    if (words.some(word => keys.includes(word))) return typed
  }

  return { type: 'string', reason: 'text, the safe default' }
}

function isReadStep (step: StepJson): boolean {
  if (step.type === 'set') return true

  // A table or a whole document is a collection the person loops over, not a value.
  return step.type === 'extract' && step.kind !== 'table'
}

/** Every step id a mapping rule reads: a plain id, a list of ids, an `each` list's id and its members' ids. */
function mappedIds (mapping: Record<string, MappingRuleJson>): Set<string> {
  const ids = new Set<string>()
  const add = (rule: FromRuleJson): void => {
    const sources = Array.isArray(rule.from) ? rule.from : [rule.from]
    for (const from of sources) ids.add(from.split('.', 1)[0])
  }
  for (const rule of Object.values(mapping)) {
    if ('each' in rule) {
      ids.add(rule.each)
      for (const member of Object.values(rule.fields)) add(member)
    } else {
      add(rule)
    }
  }

  return ids
}

/** An id as lowercase words: `bookTitle`, `book_title` and `book-title` are `book`, `title`. */
function wordsOf (id: string): string[] {
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll).
  return id.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z\d]+/).filter(word => word !== '')
}

/** The id as a field name no other field has: illegal characters become `_`, a clash gets `2`, `3`... */
function freeName (id: string, taken: ReadonlySet<string>): string {
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll).
  let base = id.replace(/[^\w-]/g, '_')
  if (!FIELD_NAME_PATTERN.test(base)) base = `field_${base}`
  let name = base
  let n = 2
  while (taken.has(name)) {
    name = `${base}${String(n)}`
    n += 1
  }

  return name
}

function stepsOf (value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) return []
  const steps = (value as { steps?: unknown }).steps

  return Array.isArray(steps) ? steps : []
}

/** Every step, nested ones (`forEach`, `paginate`, `if` bodies and `else`) included, in reading order. */
function flatten (steps: unknown[]): StepJson[] {
  return steps.flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null) return []
    const step = raw as StepJson
    const elseSteps = Array.isArray(step.else) ? step.else : []

    return [step, ...flatten(stepsOf(step)), ...flatten(elseSteps)]
  })
}
