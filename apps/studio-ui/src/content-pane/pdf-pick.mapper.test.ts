import { cellBox, columnKeyFrom, escapedRowPattern, regionCardNode, regionIdFrom, regionSelector, tableCardNode, unionBox } from './pdf-pick.mapper'

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

describe('regionSelector / cellBox / unionBox (issue #121)', () => {
  it('writes the engine\'s own selector shape in whole points, ranges ordered', () => {
    expect(regionSelector('page', 1, { x1: 252.4, y1: 663.6, x2: 72, y2: 640 })).toBe('page=1 x=72..252 y=640..664')
    expect(regionSelector('slide', 3, { x1: 59.6, y1: 29.5, x2: 900.4, y2: 90 })).toBe('slide=3 x=60..900 y=30..90')
  })

  it('a cell\'s box is its text box padded a point on every side, a zero-width cell still a point wide', () => {
    expect(cellBox({ x: 72, y: 800, width: 200, height: 12, text: 'Title' })).toEqual({ x1: 71, y1: 799, x2: 273, y2: 813 })
    expect(cellBox({ x: 72, y: 800, width: 0, height: 12, text: '' }).x2).toBe(74)
  })

  it('the union of two boxes is the smallest box holding both', () => {
    expect(unionBox({ x1: 71, y1: 799, x2: 273, y2: 813 }, { x1: 71, y1: 699, x2: 173, y2: 711 })).toEqual({ x1: 71, y1: 699, x2: 273, y2: 813 })
  })
})

describe('regionIdFrom', () => {
  it('camel-cases the first few words of the first line, and falls back to "text"', () => {
    expect(regionIdFrom('DEALER DISCOUNTS - SEPTEMBER 2026\nsecond line')).toBe('dealerDiscountsSeptember2026')
    expect(regionIdFrom('NOTE: invoices dated before 01/07/2025 are excluded')).toBe('noteInvoicesDatedBefore')
    expect(regionIdFrom('***')).toBe('text')
    expect(regionIdFrom('')).toBe('text')
  })
})

describe('regionCardNode', () => {
  it('builds a region extract card with the selector and id as given', () => {
    const card = regionCardNode('page=1 x=71..273 y=799..813', 'steps.1', 'title')
    expect(card).toEqual({ kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'title', kind: 'region', selector: 'page=1 x=71..273 y=799..813' } })
  })
})
