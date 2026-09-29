/** One transform op's editable options, for the Record tab's transform-chain editor (issue #92): each entry's own extra fields beyond `op`, as plain text inputs (parsed to a number where the field is numeric). `hook` is deliberately absent — out of scope for this phase: a hook block shows its name only, never an options form. */
export interface TransformOptionField {
  name:     string
  numeric?: boolean
}

export const TRANSFORM_OPS: readonly string[] = [
  'trim', 'lowercase', 'uppercase', 'replace', 'regex', 'split', 'join', 'first', 'last', 'nth', 'slice',
  'concat', 'coalesce', 'default', 'number', 'integer', 'boolean', 'toString', 'padStart', 'padEnd',
  'currency', 'date', 'absoluteUrl',
  'urlEncode', 'flatten', 'unique', 'sum', 'count', 'template', 'jsonpath', 'lookup', 'group',
]

const OPTIONS: Record<string, TransformOptionField[]> = {
  replace:     [{ name: 'pattern' }, { name: 'replacement' }, { name: 'flags' }],
  regex:       [{ name: 'pattern' }, { name: 'group', numeric: true }, { name: 'flags' }],
  split:       [{ name: 'separator' }],
  join:        [{ name: 'separator' }],
  nth:         [{ name: 'index', numeric: true }],
  slice:       [{ name: 'start', numeric: true }, { name: 'end', numeric: true }],
  concat:      [{ name: 'separator' }],
  default:     [{ name: 'value' }],
  number:      [{ name: 'locale' }],
  boolean:     [{ name: 'truthy' }],
  padStart:    [{ name: 'length', numeric: true }, { name: 'char' }],
  padEnd:      [{ name: 'length', numeric: true }, { name: 'char' }],
  currency:    [{ name: 'locale' }, { name: 'currency' }],
  date:        [{ name: 'format' }, { name: 'timezone' }],
  absoluteUrl: [{ name: 'base' }],
  template:    [{ name: 'value' }],
  jsonpath:    [{ name: 'path' }],
  lookup:      [{ name: 'in' }, { name: 'key' }, { name: 'pick' }],
  group:       [{ name: 'by' }],
}

/** @returns The op's editable option fields (beyond `op` itself); empty for an op with none (`trim`, `first`, …) or one not in the catalog. */
export function optionFieldsOf (op: string): TransformOptionField[] {
  return OPTIONS[op] ?? []
}
