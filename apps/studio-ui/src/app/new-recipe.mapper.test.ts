import { RECIPE_ID_PATTERN, documentRecipeFiles, newRecipeFiles, recipeIdFromFileName, uniqueRecipeId } from './new-recipe.mapper'

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

describe('documentRecipeFiles (issue #120)', () => {
  it('builds an api recipe whose one request step reads the dropped document by its file: URL, with no emit yet', () => {
    const files = documentRecipeFiles('/r', 'report', 'file:///r/report.pdf')
    expect(files.outputPath).toBe('/r/report.output.json')
    expect(files.output).toEqual({ kind: 'output', id: 'report', version: 1, fields: {} })
    expect(files.input).toEqual({
      kind:    'input',
      id:      'report',
      output:  'report',
      mode:    'api',
      start:   [{ url: 'file:///r/report.pdf' }],
      steps:   [{ type: 'request', id: 'doc', url: '{{start.url}}' }],
      mapping: {},
    })
  })
})

describe('recipeIdFromFileName', () => {
  it('drops the extension, lowercases, and folds every run of other characters into one hyphen', () => {
    expect(recipeIdFromFileName('report.pdf')).toBe('report')
    expect(recipeIdFromFileName('Q3 Report (final).pdf')).toBe('q3-report-final')
    expect(recipeIdFromFileName('Listino_2026.v2.xlsx')).toBe('listino-2026-v2')
  })

  it('always answers a valid recipe id, falling back to "document" for a name with nothing usable', () => {
    for (const name of ['report.pdf', '---.pdf', '.hidden', 'ÀÉÎ.csv', 'Makefile']) expect(RECIPE_ID_PATTERN.test(recipeIdFromFileName(name))).toBe(true)
    expect(recipeIdFromFileName('---.pdf')).toBe('document')
    expect(recipeIdFromFileName('.pdf')).toBe('document')
  })
})

describe('uniqueRecipeId', () => {
  it('keeps a free id, and numbers one already taken past every taken number', () => {
    expect(uniqueRecipeId('report', [])).toBe('report')
    expect(uniqueRecipeId('report', ['report'])).toBe('report-2')
    expect(uniqueRecipeId('report', ['report', 'report-2', 'other'])).toBe('report-3')
  })
})
