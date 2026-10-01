import { parseRegion, regionSelector } from '../pdf-document'
import type { DeckDocument, DeckShape } from './deck-document.model'
import { deckRegionText } from './deck-region.algorithm'

function shape (x: number, y: number, width: number, height: number, text: string, placeholder?: string): DeckShape {
  return { x, y, width, height, text, ...(placeholder !== undefined && { placeholder }) }
}

/** Three slides at 960×540: a title + body + footer each, the last one hidden. */
function deck (): DeckDocument {
  const slide = (number: number, title: string, hidden = false): DeckDocument['slides'][number] => ({
    number,
    title,
    hidden,
    shapes: [shape(60, 30, 840, 60, title, 'title'), shape(60, 120, 840, 300, `Body of ${title}`, 'body'), shape(60, 500, 300, 20, `Page ${String(number)}`)],
    tables: [],
    charts: [],
    notes:  '',
  })

  return { kind: 'deck', width: 960, height: 540, slides: [slide(1, 'Welcome'), slide(2, 'Prices'), slide(3, 'Draft', true)] }
}

describe('deckRegionText', () => {
  it('reads the shapes at least half inside the box on the named slide, in reading order, joined by a newline', () => {
    const matches = deckRegionText(deck(), { on: 'slide', at: 2, x1: 0, y1: 0, x2: 960, y2: 450 })
    expect(matches).toEqual([{ slide: 2, text: 'Prices\nBody of Prices', shapes: [shape(60, 30, 840, 60, 'Prices', 'title'), shape(60, 120, 840, 300, 'Body of Prices', 'body')] }])
  })

  it('a box that only grazes a shape leaves it out; one covering more than half of it takes it', () => {
    // The title spans y 30..90: a box down to 55 covers 42% of it, one down to 65 covers 58%.
    expect(deckRegionText(deck(), { on: 'slide', at: 1, x1: 0, y1: 0, x2: 960, y2: 55 })).toEqual([])
    expect(deckRegionText(deck(), { on: 'slide', at: 1, x1: 0, y1: 0, x2: 960, y2: 65 })[0].text).toBe('Welcome')
  })

  it('slide=* reads every visible slide, skipping a hidden one; a hidden slide named by number is read', () => {
    const footers = deckRegionText(deck(), { on: 'slide', at: '*', x1: 0, y1: 490, x2: 960, y2: 540 })
    expect(footers.map(match => [match.slide, match.text])).toEqual([[1, 'Page 1'], [2, 'Page 2']])
    expect(deckRegionText(deck(), { on: 'slide', at: 3, x1: 0, y1: 0, x2: 960, y2: 100 })[0].text).toBe('Draft')
  })

  it('gives no match for a slide where nothing sits in the box, or a slide the deck does not have', () => {
    expect(deckRegionText(deck(), { on: 'slide', at: 1, x1: 900, y1: 450, x2: 960, y2: 490 })).toEqual([])
    expect(deckRegionText(deck(), { on: 'slide', at: 9, x1: 0, y1: 0, x2: 960, y2: 540 })).toEqual([])
  })

  it('round-trips through the selector the studio writes', () => {
    const selector = regionSelector({ on: 'slide', at: 2, x1: 59.6, y1: 29.5, x2: 900.4, y2: 90 })
    expect(selector).toBe('slide=2 x=60..900 y=30..90')
    expect(deckRegionText(deck(), parseRegion(selector))[0].text).toBe('Prices')
  })
})
