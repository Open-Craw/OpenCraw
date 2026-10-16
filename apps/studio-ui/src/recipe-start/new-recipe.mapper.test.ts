import { RECIPE_ID_PATTERN, documentRecipeFiles, documentUrlRecipeFiles, newRecipeFiles, recipeIdFromAddress, recipeIdFromFileName, startUrlError, uniqueRecipeId } from './new-recipe.mapper'

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
    expect(files.outputPath).toBe('/r/widgets.ocw-out.json')
    expect(files.inputPath).toBe('/r/widgets.ocw-in.json')
    expect(files.output).toEqual({ kind: 'output', id: 'widgets', version: 1, fields: {} })
    expect(files.input).toMatchObject({ kind: 'input', id: 'widgets', output: 'widgets', mode: 'web' })
    expect((files.input.steps as unknown[])).toHaveLength(2)
  })

  it('starts on the given URL, example.com when none (issue #151)', () => {
    expect(newRecipeFiles('/r', 'w', 'https://shop.test/catalog').input.start).toEqual([{ url: 'https://shop.test/catalog' }])
    expect(newRecipeFiles('/r', 'w').input.start).toEqual([{ url: 'https://example.com' }])
  })

  it('accepts a blank or http(s) start URL and says why anything else will not do', () => {
    expect(startUrlError('')).toBeUndefined()
    expect(startUrlError('https://a.test/x?y=1')).toBeUndefined()
    expect(startUrlError('shop.test')).toContain('full address')
    expect(startUrlError('ftp://a.test')).toContain('http')
  })

  it('tolerates a trailing slash on the folder', () => {
    expect(newRecipeFiles('/r/', 'widgets').outputPath).toBe('/r/widgets.ocw-out.json')
  })
})

describe('documentRecipeFiles (issue #120)', () => {
  it('builds an api recipe whose one request step reads the dropped document by its file: URL, with no emit yet', () => {
    const files = documentRecipeFiles('/r', 'report', 'file:///r/report.pdf')
    expect(files.outputPath).toBe('/r/report.ocw-out.json')
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

describe('recipeIdFromAddress', () => {
  it.each([
    ['https://quotes.toscrape.com/', 'quotes-toscrape'],
    ['https://www.legislation.gov.uk/ukpga/2019/4/section/1', 'legislation-section-1'],
    ['https://www.legislation.gov.uk/ukpga/2019/4/contents', 'legislation-contents'],
    ['https://www.legislation.gov.uk/ukpga/2019/4/pdfs/ukpga_20190004_en.pdf', 'legislation-ukpga-20190004-en'],
    ['https://www.kia.com/uk/new-cars/ev3/pricing/', 'kia-pricing'],
    ['https://jsonplaceholder.typicode.com/users', 'jsonplaceholder-typicode-users'],
    ['https://raw.githubusercontent.com/github/gitignore/main/README.md', 'raw-githubusercontent-readme'],
    ['not an address', 'document'],
  ])('names %s %s', (address, id) => {
    expect(recipeIdFromAddress(address)).toBe(id)
  })

  it('gives two pages of one site two names', () => {
    expect(recipeIdFromAddress('https://www.legislation.gov.uk/a/section/1')).not.toBe(recipeIdFromAddress('https://www.legislation.gov.uk/a/contents'))
  })
})

describe('documentUrlRecipeFiles', () => {
  it('starts an api recipe whose request reads the response as the kind of document it is, whatever it is served as', () => {
    const files = documentUrlRecipeFiles('/work', 'car-list', 'https://shop.example/api/car.list', 'json')

    expect(files.inputPath).toBe('/work/car-list.ocw-in.json')
    expect(files.input).toMatchObject({ mode: 'api', start: [{ url: 'https://shop.example/api/car.list' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' }] })
  })
})
