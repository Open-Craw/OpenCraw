import { cardSentence } from './card-sentence.mapper'

function texts (step: Record<string, unknown>): string[] {
  return cardSentence(step).parts.map(part => part.text)
}

describe('cardSentence', () => {
  it('reads a goto as "Go to <url>"', () => {
    expect(texts({ type: 'goto', url: 'https://example.com/' })).toEqual(['Go to', 'https://example.com/'])
    expect(cardSentence({ type: 'goto', url: '/' }).custom).toBe(false)
  })

  it('reads an extract as "Read <id> from <from> ← <selector>"', () => {
    const step = { type: 'extract', id: 'title', from: 'book', selector: 'h1', kind: 'css' }
    expect(texts(step)).toEqual(['Read', 'title', 'from', 'book', '←', 'h1'])
    const parts = cardSentence(step).parts
    expect(parts[1]).toEqual({ kind: 'pill', text: 'title' })
    expect(parts[3]).toEqual({ kind: 'pill', text: 'book' })
  })

  it('reads an extract with no "from" as reading the page', () => {
    expect(texts({ type: 'extract', id: 'title', selector: 'h1', kind: 'css' })).toEqual(['Read', 'title', 'from', 'page', '←', 'h1'])
  })

  it('reads a forEach as "For each <as> in <over> → one record" when it emits', () => {
    expect(texts({ type: 'forEach', as: 'book', over: 'books', emit: true, steps: [] })).toEqual(['For each', 'book', 'in', 'books', '→', 'one record'])
  })

  it('drops "→ one record" from a forEach that does not emit', () => {
    expect(texts({ type: 'forEach', as: 'book', over: 'books', steps: [] })).toEqual(['For each', 'book', 'in', 'books'])
  })

  it('reads a forEach over live elements by its selector, not a pill', () => {
    const parts = cardSentence({ type: 'forEach', as: 'row', selector: 'tr', steps: [] }).parts
    expect(parts[3]).toEqual({ kind: 'code', text: 'tr' })
  })

  it('reads a paginate as "For every page via <selector>"', () => {
    expect(texts({ type: 'paginate', next: { selector: 'a.next' }, steps: [] })).toEqual(['For every page', 'via', 'a.next'])
  })

  it('reads an if as "If <test>"', () => {
    expect(texts({ type: 'if', test: '{{flag}}', steps: [] })).toEqual(['If', '{{flag}}'])
  })

  it('reads a fill as "Fill <target> with <value>"', () => {
    expect(texts({ type: 'fill', selector: '#name', value: 'Ada' })).toEqual(['Fill', '#name', 'with', 'Ada'])
  })

  it('reads a set as "Set <id> to <value>", stringifying a non-string value', () => {
    expect(texts({ type: 'set', id: 'x', value: [] })).toEqual(['Set', 'x', 'to', '[]'])
  })

  it('reads a collect as "Collect <value> into <into>"', () => {
    expect(texts({ type: 'collect', into: 'authors', value: '{{author}}' })).toEqual(['Collect', '{{author}}', 'into', 'authors'])
  })

  it('reads an emit with no output as just "Emit"', () => {
    expect(texts({ type: 'emit' })).toEqual(['Emit'])
  })

  it('falls back to a custom card for evaluate, hook and captcha', () => {
    for (const type of ['evaluate', 'hook', 'captcha']) {
      expect(cardSentence({ type }).custom).toBe(true)
    }
  })

  it('falls back to a custom card for a missing or unknown type, never throwing', () => {
    expect(cardSentence({}).custom).toBe(true)
    expect(cardSentence({ type: 'not-a-real-step' }).custom).toBe(true)
    expect(cardSentence({ type: 123 }).custom).toBe(true)
  })

  it('falls back to custom instead of throwing when a field is a shape the builder does not expect', () => {
    expect(() => cardSentence({ type: 'goto', url: { nested: true } })).not.toThrow()
    expect(cardSentence({ type: 'select', selector: 's' }).custom).toBe(false)
  })
})
