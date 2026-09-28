import { columnKeyFrom, escapedRowPattern, regexCardNode, tableCardNode } from './pdf-pick.mapper'

describe('escapedRowPattern', () => {
  it('anchors the text at the start and escapes regex metacharacters', () => {
    expect(escapedRowPattern('MODELS ALPHA')).toBe('^MODELS ALPHA')
    expect(escapedRowPattern('Discount %* (PROMO)')).toBe(String.raw`^Discount %\* \(PROMO\)`)
  })

  it('trims surrounding whitespace before escaping', () => {
    expect(escapedRowPattern('  NOTE  ')).toBe('^NOTE')
  })

  it('actually matches the text it was built from, and only text starting the same way', () => {
    const pattern = new RegExp(escapedRowPattern('MODELS ALPHA'), 'i')
    expect(pattern.test('MODELS ALPHA Discount % Excluded')).toBe(true)
    expect(pattern.test('models alpha')).toBe(true) // core always compiles table patterns case-insensitively
    expect(pattern.test('SOMETHING MODELS ALPHA')).toBe(false)
  })
})

describe('columnKeyFrom', () => {
  it('lowerCamelCases a multi-word header', () => {
    expect(columnKeyFrom('Excluded versions')).toBe('excludedVersions')
    expect(columnKeyFrom('MODELS ALPHA')).toBe('modelsAlpha')
  })

  it('drops punctuation', () => {
    expect(columnKeyFrom('Discount %*')).toBe('discount')
  })

  it('falls back to "column" when nothing letters-or-digits is left', () => {
    expect(columnKeyFrom('***')).toBe('column')
    expect(columnKeyFrom('')).toBe('column')
  })
})

describe('tableCardNode', () => {
  it('builds a table extract card from just a header pick', () => {
    const card = tableCardNode({ header: '^MODELS ALPHA' }, 'steps.0')
    expect(card).toEqual({
      kind:     'card',
      path:     'steps.0',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'table', kind: 'table', selector: '^MODELS ALPHA' },
    })
  })

  it('adds until once the boundary row is picked, and columns once a band is picked', () => {
    const card = tableCardNode({ header: '^MODELS ALPHA', until: '^NOTE', columns: { model: '^MODELS ALPHA', discount: '^Discount' } }, 'steps.0')
    expect(card.step).toEqual({ type: 'extract', id: 'table', kind: 'table', selector: '^MODELS ALPHA', until: '^NOTE', columns: { model: '^MODELS ALPHA', discount: '^Discount' } })
  })

  it('leaves out columns when the draft has an empty object (no band picked yet)', () => {
    const card = tableCardNode({ header: '^MODELS ALPHA', columns: {} }, 'steps.0')
    expect(card.step).not.toHaveProperty('columns')
  })

  it('throws when no header has been picked yet', () => {
    expect(() => tableCardNode({}, 'steps.0')).toThrow(/header row/)
  })

  it('takes a custom id', () => {
    const card = tableCardNode({ header: '^MODELS' }, 'steps.0', 'discounts')
    expect(card.step.id).toBe('discounts')
  })
})

describe('regexCardNode', () => {
  it('builds a regex extract card whose pattern matches the exact dragged rows, newline-separated (the shape pdfText joins pages\' rows in)', () => {
    const rows = ['CITY (model 101)\t19,0%', 'CITY EV (model 102)\t3,0%']
    const card = regexCardNode(rows, 'steps.1')
    expect(card.step.kind).toBe('regex')
    const pattern = new RegExp(card.step.selector as string)
    expect(pattern.test(rows.join('\n'))).toBe(true)
    // Escaped, so a parenthesis in the text is not read as a regex group.
    expect(pattern.test('CITY XmodelX 101X19,0%\nCITY EV (model 102)\t3,0%')).toBe(false)
  })

  it('throws when the drag covers no row', () => {
    expect(() => regexCardNode([], 'steps.1')).toThrow(/no row/)
  })
})
