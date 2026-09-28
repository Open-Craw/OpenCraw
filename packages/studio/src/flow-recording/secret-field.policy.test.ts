import { isSecretField, secretEnvName, secretPlaceholder } from './secret-field.policy'

describe('isSecretField', () => {
  it('flags a password input', () => {
    expect(isSecretField({ type: 'password', name: 'pass' })).toBe(true)
  })

  it('flags a field named token/secret/api-key, case-insensitively', () => {
    expect(isSecretField({ type: 'text', name: 'apiToken' })).toBe(true)
    expect(isSecretField({ type: 'text', name: 'SECRET_CODE' })).toBe(true)
    expect(isSecretField({ type: 'text', name: 'api-key' })).toBe(true)
    expect(isSecretField({ type: 'text', name: 'api_key' })).toBe(true)
    expect(isSecretField({ type: 'text', id: 'apikey' })).toBe(true)
  })

  it('does not flag an ordinary text field', () => {
    expect(isSecretField({ type: 'text', name: 'username' })).toBe(false)
  })

  it('flags a field the person explicitly marked, whatever its type/name', () => {
    expect(isSecretField({ type: 'text', name: 'q' }, true)).toBe(true)
  })
})

describe('secretEnvName', () => {
  it('turns camelCase/kebab-case/snake_case names into the same SCREAMING_SNAKE_CASE', () => {
    expect(secretEnvName({ name: 'userPass' })).toBe('USER_PASS')
    expect(secretEnvName({ name: 'user-pass' })).toBe('USER_PASS')
    expect(secretEnvName({ name: 'user_pass' })).toBe('USER_PASS')
  })

  it('falls back to PASSWORD for a bare password field with no name or id', () => {
    expect(secretEnvName({ type: 'password' })).toBe('PASSWORD')
  })

  it('falls back to SECRET when there is nothing usable at all', () => {
    expect(secretEnvName({})).toBe('SECRET')
  })

  it('prefixes an underscore when the name would otherwise start with a digit', () => {
    expect(secretEnvName({ name: '2fa-code' })).toBe('_2FA_CODE')
  })
})

describe('secretPlaceholder', () => {
  it('builds the {{env.NAME}} template, never the real value', () => {
    expect(secretPlaceholder({ type: 'password', name: 'pass' })).toBe('{{env.PASS}}')
  })
})
