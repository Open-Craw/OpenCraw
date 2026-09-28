import type { TransformJson } from './transform-chain.component'

/**
 * An output field, as plain JSON — the browser's own copy of `@opencraw/core`'s
 * `FieldSpec` shape, never imported as a runtime or type dependency (the UI
 * only ever gets types from `@opencraw/studio`, see `studio-client.ts`'s
 * boundary comment). Kept structural on purpose: a field mid-edit in the
 * Record tab may not be a valid `FieldSpec` yet (a half-typed `currency`
 * with no code), the same way `scope-outline`'s server-side mappers tolerate
 * a recipe mid-edit.
 */
export interface FieldSpecJson {
  type:         string
  description?: string
  required?:    boolean
  nullable?:    boolean
  default?:     unknown
  onMissing?:   string
  key?:         boolean
  generated?:   string
  format?:      string
  currency?:    string
  values?:      string[]
  items?:       FieldSpecJson
  fields?:      Record<string, FieldSpecJson>
  min?:         number
  max?:         number
  pattern?:     string
  minLength?:   number
  maxLength?:   number
}

/** A `from` mapping rule, as plain JSON — `@opencraw/core`'s `FromRule` shape. */
export interface FromRuleJson {
  from:       string | string[]
  transform?: TransformJson[]
  onMissing?: string
}

/** An `each` mapping rule, as plain JSON — `@opencraw/core`'s `EachRule` shape: a list of objects, one nested `FromRuleJson` per member. */
export interface EachRuleJson {
  each:       string
  fields:     Record<string, FromRuleJson>
  onMissing?: string
}

export type MappingRuleJson = FromRuleJson | EachRuleJson

export function isEachRule (rule: MappingRuleJson | undefined): rule is EachRuleJson {
  return rule !== undefined && 'each' in rule
}

/** The output types the Record tab's type dropdown offers (`@opencraw/core`'s `FIELD_TYPES`, kept as a local literal list for the same reason as `field-spec.model.ts`'s own doc comment). */
export const FIELD_TYPES: readonly string[] = ['string', 'number', 'integer', 'boolean', 'date', 'datetime', 'currency', 'url', 'enum', 'array', 'object', 'json']

export const MISSING_POLICIES: readonly string[] = ['fail', 'skip-record', 'null', 'default']

export const GENERATED_VALUES: readonly string[] = ['now', 'uuid', 'sourceUrl', 'recipeId']

/** A field name has no dots, matching `@opencraw/core`'s own `fieldName` rule (issue #81). */
export const FIELD_NAME_PATTERN = /^[A-Z_][\w-]*$/i
