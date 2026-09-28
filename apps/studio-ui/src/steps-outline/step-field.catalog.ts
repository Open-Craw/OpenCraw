/**
 * Which Chakra control the expanded form shows for a step's common fields,
 * per type. A hand-authored catalog, not a live reading of
 * `packages/core/schemas/input-recipe.schema.json`: that schema is not part
 * of `@opencraw/core`'s published `exports`/`files` (checked directly, not
 * assumed — the phase 0 release notes are exactly why), and adding a
 * subpath for it would be the kind of package build-wiring change this
 * phase does not need. This catalog mirrors `step.contract.ts`'s fields for
 * the step types the `+` menu offers, plus the everyday ones (`select`,
 * `press`, `scroll`, `wait`, `screenshot`, `request`) the outline can still
 * render as a sentence. A field this catalog does not cover, and anything
 * on a step this catalog has no entry for at all (`evaluate`, `hook`,
 * `captcha`, and any future type), is still there in `step`'s raw JSON: the
 * form's "Advanced (JSON)" box, never dropped.
 */
export type FieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'json'

export interface FieldSpec {
  key:      string
  label:    string
  kind:     FieldKind
  options?: readonly string[]
}

const id: FieldSpec = { key: 'id', label: 'id', kind: 'string' }
const when: FieldSpec = { key: 'when', label: 'when (template)', kind: 'string' }

export const STEP_FIELDS: Record<string, FieldSpec[]> = {
  goto: [
    { key: 'url', label: 'url', kind: 'string' },
    { key: 'waitUntil', label: 'wait until', kind: 'enum', options: ['load', 'domcontentloaded', 'networkidle', 'commit'] },
    when,
  ],
  click: [
    { key: 'selector', label: 'selector', kind: 'string' },
    { key: 'optional', label: 'optional', kind: 'boolean' },
    id, when,
  ],
  fill: [
    { key: 'selector', label: 'selector', kind: 'string' },
    { key: 'value', label: 'value (template)', kind: 'string' },
    id, when,
  ],
  press: [
    { key: 'selector', label: 'selector', kind: 'string' },
    { key: 'key', label: 'key', kind: 'string' },
    id, when,
  ],
  select: [
    { key: 'selector', label: 'selector', kind: 'string' },
    { key: 'value', label: 'value', kind: 'string' },
    id, when,
  ],
  scroll: [
    { key: 'to', label: 'to', kind: 'string' },
    { key: 'untilStable', label: 'until stable', kind: 'boolean' },
    when,
  ],
  wait: [
    { key: 'selector', label: 'selector', kind: 'string' },
    { key: 'ms', label: 'ms', kind: 'number' },
    when,
  ],
  screenshot: [
    { key: 'path', label: 'path', kind: 'string' },
    id, when,
  ],
  request: [
    { key: 'url', label: 'url', kind: 'string' },
    { key: 'method', label: 'method', kind: 'enum', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] },
    { key: 'as', label: 'read as', kind: 'enum', options: ['text', 'json', 'html', 'xml', 'csv', 'yaml', 'pdf', 'workbook', 'deck'] },
    id, when,
  ],
  extract: [
    { key: 'selector', label: 'selector', kind: 'string' },
    { key: 'kind', label: 'kind', kind: 'enum', options: ['css', 'xpath', 'jsonpath', 'table'] },
    { key: 'take', label: 'take', kind: 'string' },
    { key: 'many', label: 'many', kind: 'boolean' },
    { key: 'from', label: 'from (id)', kind: 'string' },
    id, when,
  ],
  set: [
    { key: 'value', label: 'value (JSON)', kind: 'json' },
    id, when,
  ],
  collect: [
    { key: 'into', label: 'into (id)', kind: 'string' },
    { key: 'value', label: 'value (JSON)', kind: 'json' },
    when,
  ],
  forEach: [
    { key: 'as', label: 'as', kind: 'string' },
    { key: 'over', label: 'over (id)', kind: 'string' },
    { key: 'selector', label: 'selector (live elements)', kind: 'string' },
    { key: 'emit', label: 'emits a record', kind: 'boolean' },
    id, when,
  ],
  paginate: [
    { key: 'until', label: 'until (template)', kind: 'string' },
    { key: 'maxPages', label: 'max pages', kind: 'number' },
    id, when,
  ],
  if: [
    { key: 'test', label: 'test (template)', kind: 'string' },
    id,
  ],
  emit: [
    { key: 'output', label: 'output recipe id', kind: 'string' },
    when,
  ],
}
