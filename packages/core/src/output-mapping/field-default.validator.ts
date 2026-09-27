import type { FieldSpec } from '../recipe-schema'
import { coerceValue, CoercionError } from './coerce-field.mapper'
import { isMissing } from './missing-value.policy'
import { validateField } from './output-field.validator'

/** One problem with an output field's `default`, at a path into the output recipe (`fields.price.default`). */
export interface DefaultIssue {
  path:    string
  message: string
}

/**
 * A field's `default` as the record gets it: coerced to the field's type and validated like a mapped value,
 * so `"default": "0"` on a `number` field is `0`.
 *
 * @param field - A field with a `default`.
 * @param path - Where the field is, for messages.
 * @returns The value; `null` for a default that is itself missing (`null`, `""`).
 * @throws CoercionError when the default cannot be the field's type or breaks its rules.
 */
export function defaultValue (field: FieldSpec, path: string): unknown {
  const value = coerceValue(field.default, field, path)
  if (isMissing(value)) return null
  const problems = validateField(value, field)
  if (problems.length > 0) throw new CoercionError(path, problems.join('; '))

  return value
}

/**
 * Checks every `default` of an output recipe's fields, members and items included, at load time: each must
 * coerce to its field's type and pass its rules, and a field whose `onMissing` is `default` must have one.
 *
 * @param fields - The output recipe's fields.
 * @param at - The path of `fields` in the recipe.
 * @returns Every problem found; empty when the defaults hold.
 */
export function validateDefaults (fields: Record<string, FieldSpec>, at = 'fields'): DefaultIssue[] {
  return Object.entries(fields).flatMap(([name, field]) => fieldIssues(field, `${at}.${name}`, name))
}

function fieldIssues (field: FieldSpec, at: string, name: string): DefaultIssue[] {
  const issues: DefaultIssue[] = []
  if (field.onMissing === 'default' && field.default === undefined) issues.push({ path: `${at}.onMissing`, message: `"${name}" has onMissing "default" but no default` })
  if (field.default !== undefined) {
    try {
      const value = defaultValue(field, name)
      if (value === null && field.required === true && field.nullable !== true) issues.push({ path: `${at}.default`, message: 'a required field\'s default cannot be empty unless the field is nullable' })
    } catch (error) {
      issues.push({ path: `${at}.default`, message: `${JSON.stringify(field.default)} is not a valid default: ${error instanceof CoercionError ? error.reason : String(error)}` })
    }
  }
  if (field.fields !== undefined) issues.push(...validateDefaults(field.fields, `${at}.fields`))
  if (field.items !== undefined) issues.push(...fieldIssues(field.items, `${at}.items`, `${name}[]`))

  return issues
}
