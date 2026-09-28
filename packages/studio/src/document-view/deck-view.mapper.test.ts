import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPptxDeck } from '@opencraw/core'
import type { DeckDocument } from '@opencraw/core'
import { deckDocumentView } from './deck-view.mapper'

const incentiviPath = join(__dirname, '..', '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')
const dfePath = join(__dirname, '..', '..', '..', '..', 'examples', 'dfe-college-accounts', 'management-accounts-model-march-2026.pptx')

describe('deckDocumentView', () => {
  let document: DeckDocument

  beforeAll(async () => {
    document = await readPptxDeck(new Uint8Array(readFileSync(incentiviPath)), incentiviPath)
  })

  it('carries the slide size and every slide\'s number, title and hidden flag over', () => {
    const view = deckDocumentView(document)
    expect([view.width, view.height]).toEqual([960, 540])
    expect(view.slides.map(slide => [slide.number, slide.title, slide.hidden])).toEqual([
      [1, 'Incentivi giugno', false],
      [2, 'Griglia prezzi Jeep', false],
      [3, 'Vendite', false],
      [4, 'Bozza', true],
    ])
  })

  it('carries every shape\'s box and text over unchanged', () => {
    const [first] = deckDocumentView(document).slides
    expect(first.shapes).toEqual([{ x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }])
  })

  it('reads a native table through the grid canvas\'s own sheet view: merged cells resolved to bounds, typed cells', () => {
    const [first] = deckDocumentView(document).slides
    expect(first.tables).toHaveLength(1)
    const [table] = first.tables
    expect(table.name).toBe('table 1')
    expect(table.merges).toEqual([
      { ref: 'A1:D1', top: 0, left: 0, bottom: 0, right: 3 },
      { ref: 'A2:A3', top: 1, left: 0, bottom: 2, right: 0 },
      { ref: 'B2:C2', top: 1, left: 1, bottom: 1, right: 2 },
      { ref: 'D2:D3', top: 1, left: 3, bottom: 2, right: 3 },
    ])
    expect(table.rows[3].map(cell => cell.value)).toEqual(['Pandina', '15.950 €', '13.955 €', '12,5%'])
  })

  it('reads a chart\'s series over unchanged', () => {
    const third = deckDocumentView(document).slides[2]
    expect(third.charts).toEqual([{
      type:   'bar',
      title:  'Immatricolazioni',
      series: [
        { name: 'Pandina', categories: ['Aprile', 'Maggio', 'Giugno'], values: [1200, 1350.5, 1410] },
        { name: '600e', categories: ['Aprile', 'Maggio', 'Giugno'], values: [300, null, 410] },
      ],
    }])
  })

  it('carries the notes over unchanged', () => {
    const [first, second] = deckDocumentView(document).slides
    expect(first.notes).toBe('Prezzi IVA inclusa.\nValidi fino al 30 giugno.')
    expect(second.notes).toBe('')
  })

  it('groups a slide\'s text boxes into visual rows, left to right, for the text-box-grid pick (issue #94\'s 5d)', () => {
    const [, second] = deckDocumentView(document).slides
    // Slide 2's title sits alone in its own row; the header row (Modello/Prezzo/Sconto) and the two data rows follow.
    const headerRow = second.shapeRows.find(row => row.length === 3 && second.shapes[row[0]].text === 'Modello')
    expect(headerRow).toBeDefined()
    expect((headerRow as number[]).map(index => second.shapes[index].text)).toEqual(['Modello', 'Prezzo', 'Sconto'])
    // Every shape index appears in exactly one row.
    const allIndices = second.shapeRows.flat()
    expect(new Set(allIndices).size).toBe(allIndices.length)
    expect(allIndices).toHaveLength(second.shapes.length)
  })

  it('is a pure function: running it twice on the same document gives the same result', () => {
    expect(deckDocumentView(document)).toEqual(deckDocumentView(document))
  })

  it('reads the DfE deck\'s waterfall chartEx chart, confirming chartEx support (issue #82) reaches the deck canvas', async () => {
    const dfe = await readPptxDeck(new Uint8Array(readFileSync(dfePath)), dfePath)
    const view = deckDocumentView(dfe)
    const slide = view.slides[8] // slide 9, per read-pptx.use-case.test.ts
    const [chart] = slide.charts
    expect(chart).toMatchObject({ type: 'waterfall', title: 'Income and Expenditure Forecast Variance to Budget (£’000)' })
    expect(chart.series).toEqual([{
      name:       'Series1',
      categories: ['Budget', 'ASF', 'Apps', 'HE', 'Other income', 'Pay', 'Non pay', 'Other   ', 'Forecast'],
      values:     [-20, -139, -56, -92, -69, 216, -110, 8, -262],
    }])
  })
})
