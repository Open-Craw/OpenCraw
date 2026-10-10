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
