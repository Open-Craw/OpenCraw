import { deckChartCardNode, deckTableCardNode, slidePattern } from './deck-pick.mapper'
import type { DeckDraft } from './deck-pick.mapper'

describe('slidePattern', () => {
  it('anchors the slide title at both ends, escaped', () => {
    expect(slidePattern('Incentivi giugno')).toBe('^Incentivi giugno$')
    expect(slidePattern('Q1 (draft)')).toBe(String.raw`^Q1 \(draft\)$`)
  })

  it('matches only that exact slide title, case-insensitively (core always compiles "slide" case-insensitively)', () => {
    const pattern = new RegExp(slidePattern('Vendite'), 'i')
    expect(pattern.test('vendite')).toBe(true)
    expect(pattern.test('Vendite 2')).toBe(false)
    expect(pattern.test('Le vendite')).toBe(false)
  })
})

describe('deckTableCardNode', () => {
  it('builds a table extract card from just a header pick', () => {
    const card = deckTableCardNode({ header: '^Modello Prezzo' }, 'steps.0')
    expect(card).toEqual({
      kind:     'card',
      path:     'steps.0',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'table', kind: 'table', selector: '^Modello Prezzo' },
    })
  })

  it('adds slide, until, columns, headerRows (only above 1) and fillDown once picked (a native table)', () => {
    const card = deckTableCardNode({
      slide:      '^Incentivi giugno$',
      header:     '^Modello',
      headerRows: 2,
      until:      '^Note',
      columns:    { model: '^Modello$' },
      fillDown:   ['model'],
    }, 'steps.0')
    expect(card.step).toEqual({
      type: 'extract', id: 'table', kind: 'table', selector: '^Modello', slide: '^Incentivi giugno$', until: '^Note', columns: { model: '^Modello$' }, headerRows: 2, fillDown: ['model'],
    })
  })

  it('adds shapes: true for a text-box-grid pick', () => {
    const card = deckTableCardNode({ slide: '^Griglia prezzi$', shapes: true, header: '^Modello' }, 'steps.0')
    expect(card.step).toMatchObject({ shapes: true, slide: '^Griglia prezzi$' })
  })

  it('leaves out headerRows when it is 1 (the default core already assumes)', () => {
    expect(deckTableCardNode({ header: '^Modello', headerRows: 1 }, 'steps.0').step).not.toHaveProperty('headerRows')
  })

  it('leaves out columns/fillDown when empty (nothing picked yet), and shapes when false', () => {
    const card = deckTableCardNode({ header: '^Modello', columns: {}, fillDown: [], shapes: false }, 'steps.0')
    expect(card.step).not.toHaveProperty('columns')
    expect(card.step).not.toHaveProperty('fillDown')
    expect(card.step).not.toHaveProperty('shapes')
  })

  it('throws when no header has been picked yet', () => {
    const empty: DeckDraft = {}
    expect(() => deckTableCardNode(empty, 'steps.0')).toThrow(/header row/)
  })

  it('takes a custom id', () => {
    expect(deckTableCardNode({ header: '^Modello' }, 'steps.0', 'prices').step.id).toBe('prices')
  })
})

describe('deckChartCardNode', () => {
  it('builds a jsonpath extract card addressing the chart\'s own series, take: "json"', () => {
    const card = deckChartCardNode(2, 0, 'steps.0')
    expect(card).toEqual({
      kind:     'card',
      path:     'steps.0',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'value', selector: '$.slides[2].charts[0].series', kind: 'jsonpath', take: 'json' },
    })
  })

  it('takes a custom id', () => {
    expect(deckChartCardNode(0, 1, 'steps.0', 'series').step.id).toBe('series')
  })
})
