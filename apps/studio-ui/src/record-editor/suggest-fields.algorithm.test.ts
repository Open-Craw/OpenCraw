import { suggestFieldFor, suggestFields } from './suggest-fields.algorithm'

const books = {
  steps: [
    { type: 'goto', url: '{{start.url}}' },
    { type: 'extract', id: 'books', kind: 'css', selector: 'article.product_pod', many: true },
    {
      type:  'forEach',
      over:  'books',
      as:    'book',
      steps: [
        { type: 'extract', id: 'title', from: 'book', kind: 'css', selector: 'h3 a', take: 'attr:title' },
        { type: 'extract', id: 'price', from: 'book', kind: 'css', selector: '.price_color' },
        { type: 'extract', id: 'availability', from: 'book', kind: 'css', selector: '.availability' },
        { type: 'extract', id: 'detailLink', from: 'book', kind: 'css', selector: 'h3 a', take: 'attr:href' },
        { type: 'emit' },
      ],
    },
  ],
}

describe('suggestFields', () => {
  it('proposes a field for each value read in a loop, never for the list it loops over', () => {
    const suggestions = suggestFields(books, {}, {})
    expect(suggestions.map(s => [s.source, s.name, s.field.type])).toEqual([
      ['title', 'title', 'string'],
      ['price', 'price', 'number'],
      ['availability', 'availability', 'boolean'],
      ['detailLink', 'detailLink', 'url'],
    ])
  })

  it('makes a relative link absolute, since a url field refuses a relative one', () => {
    const link = suggestFields(books, {}, {}).find(s => s.source === 'detailLink')
    expect(link?.rule).toEqual({ from: 'detailLink', transform: [{ op: 'absoluteUrl' }] })
  })

  it('leaves out what a field already reads, a list id an each rule uses, and what the mapping names in a template path', () => {
    const mapping = { title: { from: 'title' }, offers: { each: 'books', fields: { cost: { from: 'price' } } }, link: { from: ['detailLink.href'] } }
    expect(suggestFields(books, { title: { type: 'string' } }, mapping).map(s => s.source)).toEqual(['availability'])
  })

  it('finds values nested in paginate and if bodies and in else', () => {
    const recipe = {
      steps: [
        { type: 'paginate', steps: [{ type: 'extract', id: 'headline', kind: 'css', selector: 'h1' }] },
        { type: 'if', steps: [], else: [{ type: 'set', id: 'note', value: 'x' }] },
      ],
    }
    expect(suggestFields(recipe, {}, {}).map(s => s.source)).toEqual(['headline', 'note'])
  })

  it('proposes a list of text for an extract of every match that nothing loops over', () => {
    const recipe = { steps: [{ type: 'extract', id: 'genres', kind: 'css', selector: '.genre', many: true }] }
    const [suggestion] = suggestFields(recipe, {}, {})
    expect(suggestion.field).toEqual({ type: 'array', items: { type: 'string' } })
  })

  it('skips tables, requests and navigation: they are not values', () => {
    const recipe = {
      steps: [
        { type: 'request', id: 'doc', url: '{{start.url}}', as: 'pdf' },
        { type: 'extract', id: 'sheet', kind: 'table', selector: '^Model', many: true },
        { type: 'extract', id: 'validUntil', kind: 'anchor', selector: 'right of ^Valid until' },
      ],
    }
    expect(suggestFields(recipe, {}, {}).map(s => [s.source, s.field.type])).toEqual([['validUntil', 'date']])
  })

  it('names a field after its id, legal and unused', () => {
    const recipe = {
      steps: [
        { type: 'extract', id: 'title', kind: 'css', selector: 'h1' },
        { type: 'extract', id: 'a.b', kind: 'css', selector: 'h2' },
        { type: 'extract', id: '9lives', kind: 'css', selector: 'h3' },
      ],
    }
    expect(suggestFields(recipe, { title: { type: 'string' } }, {}).map(s => s.name)).toEqual(['title2', 'a_b', 'field_9lives'])
  })

  it('reads an empty or half-written recipe without throwing', () => {
    expect(suggestFields(undefined, {}, {})).toEqual([])
    expect(suggestFields({ steps: [null, 4, { type: 'extract' }] }, {}, {})).toEqual([])
  })
})

describe('suggestFieldFor', () => {
  it('gives the proposal a value the steps read would get', () => {
    const suggestion = suggestFieldFor('detailLink', books, {}, {})
    expect(suggestion).toMatchObject({ source: 'detailLink', name: 'detailLink', field: { type: 'url' }, rule: { from: 'detailLink', transform: [{ op: 'absoluteUrl' }] } })
  })

  it('falls back to a text field named after the id for anything else, such as a loop alias or an id already mapped', () => {
    expect(suggestFieldFor('book', books, {}, {})).toMatchObject({ name: 'book', field: { type: 'string' }, rule: { from: 'book' } })
    expect(suggestFieldFor('price', books, { price: { type: 'number' } }, { price: { from: 'price' } })).toMatchObject({ name: 'price2', rule: { from: 'price' } })
  })
})
