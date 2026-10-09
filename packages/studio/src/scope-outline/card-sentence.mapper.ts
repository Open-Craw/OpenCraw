import type { SentencePart } from './outline.model'

/** Step types the plan doc names as always going to a "custom" card: nothing here renders their meaning as a sentence. */
const ALWAYS_CUSTOM = new Set(['evaluate', 'captcha'])

export interface StepSentence {
  parts:  SentencePart[]
  /** `true` when this is a fallback (an unrecognised type, or one of `ALWAYS_CUSTOM`): the UI shows `step`'s raw JSON instead of trusting `parts` alone. */
  custom: boolean
}

/**
 * Turns one step's raw JSON into its sentence parts (word/pill/code), the
 * way the plan doc's examples read: *Go to…*, *Read… from…*, *For each… in…
 * → one record*, and so on. Never throws: a step type this cannot read
 * becomes a short, honest fallback with `custom: true`, so the outline never
 * drops a step for looking unfamiliar.
 *
 * @param step - A step's raw JSON (its `type` and whatever fields it has).
 * @returns The sentence parts, and whether they are a real reading or a fallback.
 */
export function cardSentence (step: Record<string, unknown>): StepSentence {
  const type = typeof step.type === 'string' ? step.type : undefined
  if (type === undefined || ALWAYS_CUSTOM.has(type)) return fallback(type)

  const build = BUILDERS[type]
  if (build === undefined) return fallback(type)

  try {
    return { parts: build(step), custom: false }
  } catch {
    return fallback(type)
  }
}

function fallback (type: string | undefined): StepSentence {
  return { parts: [word(type ?? 'custom step')], custom: true }
}

function word (text: string): SentencePart { return { kind: 'word', text } }
function pill (text: string): SentencePart { return { kind: 'pill', text } }
function code (text: string): SentencePart { return { kind: 'code', text } }

/** A field that names an id: shown as a pill, `fallbackText` when it is absent. */
function pillField (step: Record<string, unknown>, key: string, fallbackText: string): SentencePart {
  const value = step[key]

  return pill(typeof value === 'string' && value.length > 0 ? value : fallbackText)
}

/** A field shown as a literal (a selector, a template, a value): stringified when it is not already a string. */
function codeField (step: Record<string, unknown>, key: string, fallbackText = ''): SentencePart {
  const value = step[key]
  if (typeof value === 'string') return code(value)
  if (value === undefined) return code(fallbackText)

  return code(safeJson(value))
}

function safeJson (value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** `selector` or `target`, whichever the step gives (`step.contract.ts`'s `TargetFields`: exactly one is present). */
function targetField (step: Record<string, unknown>): SentencePart {
  if (typeof step.target === 'string') return code(step.target)

  return codeField(step, 'selector')
}

const BUILDERS: Record<string, (step: Record<string, unknown>) => SentencePart[]> = {
  goto:       step => [word('Go to'), codeField(step, 'url')],
  click:      step => [word('Click'), targetField(step)],
  fill:       step => [word('Fill'), targetField(step), word('with'), codeField(step, 'value')],
  press:      step => [word('Press'), codeField(step, 'key'), word('in'), targetField(step)],
  select:     step => [word('Choose'), selectChoice(step), word('in'), targetField(step)],
  scroll:     step => [word('Scroll to'), codeField(step, 'to')],
  wait:       step => [word('Wait for'), waitFor(step)],
  screenshot: step => [word('Screenshot'), codeField(step, 'path')],
  request:    step => [word('Request'), code(`${typeof step.method === 'string' ? step.method : 'GET'} `), codeField(step, 'url')],
  extract:    step => [word('Read'), pillField(step, 'id', '(unnamed)'), word('from'), pillField(step, 'from', 'page'), word('←'), codeField(step, 'selector')],
  set:        step => [word('Set'), pillField(step, 'id', '(unnamed)'), word('to'), codeField(step, 'value')],
  collect:    step => [word('Collect'), codeField(step, 'value'), word('into'), pillField(step, 'into', '(unnamed)')],
  forEach:    step => forEachSentence(step),
  paginate:   step => paginateSentence(step),
  if:         step => [word('If'), codeField(step, 'test')],
  hook:       step => [word('Run hook'), pillField(step, 'name', '(choose a hook)')],
  emit:       step => emitSentence(step),
}

function selectChoice (step: Record<string, unknown>): SentencePart {
  if (typeof step.value === 'string') return code(step.value)
  if (typeof step.label === 'string') return code(step.label)
  if (typeof step.index === 'number') return code(String(step.index))
  if (Array.isArray(step.values)) return code(step.values.join(', '))

  return code('')
}

function waitFor (step: Record<string, unknown>): SentencePart {
  if (typeof step.selector === 'string') return code(step.selector)
  if (typeof step.ms === 'number') return code(`${step.ms}ms`)
  if (typeof step.state === 'string') return code(step.state)

  return code('')
}

function forEachSentence (step: Record<string, unknown>): SentencePart[] {
  const parts = [word('For each'), pillField(step, 'as', '(item)'), word('in'), typeof step.over === 'string' ? pill(step.over) : targetField(step)]
  if (step.emit !== undefined) parts.push(word('→'), word('one record'))

  return parts
}

function paginateSentence (step: Record<string, unknown>): SentencePart[] {
  const parts = [word('For every page')]
  const next = step.next
  if (next !== null && typeof next === 'object') {
    const record = next as Record<string, unknown>
    if (typeof record.selector === 'string') parts.push(word('via'), code(record.selector))
    else if (typeof record.url === 'string') parts.push(word('via'), code(record.url))
    else if (typeof record.jsonpath === 'string') parts.push(word('via'), code(record.jsonpath))
  }
  if (typeof step.until === 'string') parts.push(word('until'), code(step.until))

  return parts
}

function emitSentence (step: Record<string, unknown>): SentencePart[] {
  if (typeof step.output === 'string') return [word('Emit'), word('to'), pill(step.output)]

  return [word('Emit')]
}
