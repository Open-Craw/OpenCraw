import type { RecordedField } from './recorded-action.contract'

/** Field names that mark a value as a secret even outside a `type="password"` input (issue #95). */
const SECRET_NAME = /token|secret|api[-_]?key/i

/**
 * Whether a recorded `fill`/`select` field's typed value is a secret: a
 * `type="password"` input, or a field the person explicitly marked (`marked`,
 * a future "mark as secret" UI action — not built by this phase, but the
 * flag is honoured wherever it comes from), or a name/id matching `token`,
 * `secret` or `api[-_]?key` (issue #95's exact wording).
 *
 * @param field - The field's type/name/id, as reported by `recorder-script.client.ts`.
 * @param marked - The person explicitly marked this field as secret; default `false`.
 * @returns Whether the field's value must become `{{env.NAME}}` instead of the real text.
 */
export function isSecretField (field: RecordedField, marked = false): boolean {
  if (marked) return true
  if (field.type === 'password') return true
  const name = field.name ?? field.id ?? ''

  return name.length > 0 && SECRET_NAME.test(name)
}

/**
 * The `{{env.NAME}}` variable name a secret field suggests, from its own
 * name/id (falling back to `PASSWORD` for a bare `type="password"` field
 * with neither): `camelCase`/`kebab-case`/`snake_case` all become
 * `SCREAMING_SNAKE_CASE`, punctuation dropped, so `user-pass`, `userPass`
 * and `user_pass` all suggest `USER_PASS`.
 *
 * @param field - The field's type/name/id.
 * @returns A valid env-var-shaped name (letters, digits, underscores, not starting with a digit).
 */
export function secretEnvName (field: RecordedField): string {
  const source = field.name ?? field.id ?? (field.type === 'password' ? 'password' : 'secret')
  const withBoundaries = source.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
  const screaming = withBoundaries.replaceAll(/[^A-Z0-9]+/gi, '_').toUpperCase().replace(/^_+/, '').replace(/_+$/, '')
  const named = screaming.length === 0 ? 'SECRET' : screaming

  return /^\d/.test(named) ? `_${named}` : named
}

/**
 * The placeholder a secret field's value becomes in the recorded recipe:
 * never the real text, in the recipe JSON or anywhere the studio logs.
 *
 * @param field - The field's type/name/id.
 * @returns `{{env.NAME}}`.
 */
export function secretPlaceholder (field: RecordedField): string {
  return `{{env.${secretEnvName(field)}}}`
}
