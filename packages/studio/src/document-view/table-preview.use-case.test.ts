import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPdf } from '@opencraw/core'
import type { PdfDocument } from '@opencraw/core'
import { previewPdfTable } from './table-preview.use-case'

const fixture = join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')

describe('previewPdfTable', () => {
  let document: PdfDocument

  beforeAll(async () => {
    document = await readPdf(new Uint8Array(readFileSync(fixture)))
  })

  it('matches the same tables findTables/analyzeTables would, with the header row index and every regrouped row highlighted', () => {
    const result = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    expect(result.error).toBeUndefined()
    expect(result.matches).toHaveLength(1)
    const [match] = result.matches
    expect(match.page).toBe(1)
    expect(document.pages[0].rows[match.headerRowIndex].text).toMatch(/^MODELS ALPHA/i)
    expect(match.table.rows).toHaveLength(6)
    // Every row index is inside the page and in order, header first.
    expect(match.matchedRowIndices[0]).toBe(match.headerRowIndex)
    expect(match.matchedRowIndices).toEqual([...match.matchedRowIndices].sort((a, b) => a - b))
    expect(new Set(match.matchedRowIndices).size).toBe(match.matchedRowIndices.length)
  })

  it('names the output by the columns option', () => {
    const result = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE', columns: { model: '^MODELS' } })
    expect(result.matches[0].table.rows[0]).toHaveProperty('model')
  })

  it('gives the column bands and the tolerance that clustered them, for a column-band pick', () => {
    const result = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    const [match] = result.matches
    expect(match.bands.length).toBeGreaterThan(0)
    expect(match.bands.map(band => band.name)).toEqual(expect.arrayContaining(['MODELS ALPHA']))
    expect(match.bandTolerance).toBeGreaterThan(0)
  })

  it('finds no matches for a header that matches nothing, without erroring', () => {
    const result = previewPdfTable(document, { header: '^NOTHING WILL MATCH THIS' })
    expect(result.error).toBeUndefined()
    expect(result.matches).toEqual([])
  })

  it('answers with an error (and no matches) instead of throwing when a pattern does not compile — expected mid-keystroke', () => {
    const result = previewPdfTable(document, { header: '(unterminated' })
    expect(result.matches).toEqual([])
    expect(result.error).toMatch(/selector/)
  })

  it('reports an invalid "until" or column pattern the same way', () => {
    expect(previewPdfTable(document, { header: '^MODELS', until: '(unterminated' }).error).toMatch(/until/)
    expect(previewPdfTable(document, { header: '^MODELS', columns: { x: '(unterminated' } }).error).toMatch(/columns\.x/)
  })

  it('is a pure function of the document and the options: running it twice gives the same result', () => {
    const first = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    const second = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    expect(second).toEqual(first)
  })
})
