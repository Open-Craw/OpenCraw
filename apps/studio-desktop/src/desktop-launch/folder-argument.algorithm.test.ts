import { folderArgument } from './folder-argument.algorithm'

describe('folderArgument', () => {
  it('skips the executable and the app path when unpackaged', () => {
    expect(folderArgument(['electron', 'apps/studio-desktop', 'recipes'], false)).toBe('recipes')
  })

  it('skips only the executable when packaged', () => {
    expect(folderArgument(['Studio.exe', 'recipes'], true)).toBe('recipes')
  })

  it('ignores flags', () => {
    expect(folderArgument(['Studio.exe', '--no-sandbox', 'recipes'], true)).toBe('recipes')
  })

  it('is undefined with no argument', () => {
    expect(folderArgument(['electron', 'apps/studio-desktop'], false)).toBeUndefined()
  })
})

describe('folderArgument with a hooks file', () => {
  it('does not take the hooks file for the folder', () => {
    expect(folderArgument(['Studio.exe', '--hooks', 'hooks.mjs', 'recipes'], true)).toBe('recipes')
    expect(folderArgument(['Studio.exe', '--plugins=plugins.mjs', 'recipes'], true)).toBe('recipes')
  })

  it('is undefined when the hooks file is the only argument', () => {
    expect(folderArgument(['Studio.exe', '--hooks', 'hooks.mjs'], true)).toBeUndefined()
  })
})
