import { hooksArgument } from './hooks-argument.algorithm'

describe('hooksArgument', () => {
  it('reads --hooks <file>', () => {
    expect(hooksArgument(['electron', 'app', '--hooks', 'hooks.mjs', 'recipes'], false)).toBe('hooks.mjs')
  })

  it('reads --plugins=<file>', () => {
    expect(hooksArgument(['Studio.exe', '--plugins=plugins.mjs'], true)).toBe('plugins.mjs')
  })

  it('falls back to OPENCRAW_PLUGINS, then OPENCRAW_HOOKS', () => {
    expect(hooksArgument(['Studio.exe'], true, { OPENCRAW_PLUGINS: 'a.mjs', OPENCRAW_HOOKS: 'b.mjs' })).toBe('a.mjs')
    expect(hooksArgument(['Studio.exe'], true, { OPENCRAW_HOOKS: 'b.mjs' })).toBe('b.mjs')
  })

  it('prefers the flag to the environment', () => {
    expect(hooksArgument(['Studio.exe', '--hooks', 'flag.mjs'], true, { OPENCRAW_PLUGINS: 'env.mjs' })).toBe('flag.mjs')
  })

  it('is undefined when nothing names a file, and a flag with no value names none', () => {
    expect(hooksArgument(['Studio.exe', 'recipes'], true)).toBeUndefined()
    expect(hooksArgument(['Studio.exe', '--hooks'], true, { OPENCRAW_PLUGINS: '' })).toBeUndefined()
  })
})
