import { RECIPE_ID_PATTERN, newRecipeFiles } from './new-recipe.mapper'

describe('RECIPE_ID_PATTERN', () => {
  it('accepts lowercase letters, digits and hyphens, starting with a letter or digit', () => {
    for (const id of ['books', 'gsa-per-diem', 'a1', '1a']) expect(RECIPE_ID_PATTERN.test(id)).toBe(true)
  })

  it('rejects an id with anything else, including a leading hyphen', () => {
    for (const id of ['', 'Books', 'my recipe', '-books', 'a_b', 'a.b']) expect(RECIPE_ID_PATTERN.test(id)).toBe(false)
  })
})

describe('newRecipeFiles', () => {
  it('builds paths under the folder and a minimal, valid web input/output pair', () => {
    const files = newRecipeFiles('/r', 'widgets')
    expect(files.outputPath).toBe('/r/widgets.output.json')
    expect(files.inputPath).toBe('/r/widgets.input.json')
    expect(files.output).toEqual({ kind: 'output', id: 'widgets', version: 1, fields: {} })
    expect(files.input).toMatchObject({ kind: 'input', id: 'widgets', output: 'widgets', mode: 'web' })
    expect((files.input.steps as unknown[])).toHaveLength(2)
  })

  it('tolerates a trailing slash on the folder', () => {
    expect(newRecipeFiles('/r/', 'widgets').outputPath).toBe('/r/widgets.output.json')
  })
})
