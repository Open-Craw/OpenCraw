import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPdf } from '@opencraw/core'
import type { PdfDocument } from '@opencraw/core'
import { pdfDocumentView } from './pdf-view.mapper'

const fixture = join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')

describe('pdfDocumentView', () => {
  let document: PdfDocument

  beforeAll(async () => {
    document = await readPdf(new Uint8Array(readFileSync(fixture)))
  })

  it('carries every page\'s size, rows and cells over unchanged, in points', () => {
    const view = pdfDocumentView(document)
    expect(view.pages).toHaveLength(document.pages.length)
    const [page] = view.pages
    const [sourcePage] = document.pages
    expect(page.number).toBe(sourcePage.number)
    expect(page.width).toBe(sourcePage.width)
    expect(page.height).toBe(sourcePage.height)
    expect(page.rows).toHaveLength(sourcePage.rows.length)
    expect(page.rows[0].cells).toEqual(sourcePage.rows[0].cells.map(cell => ({ x: cell.x, y: cell.y, width: cell.width, height: cell.height, text: cell.text })))
  })

  it('counts rows and cells per page, and says the page has a text layer', () => {
    const [page] = pdfDocumentView(document).pages
    expect(page.rowCount).toBe(page.rows.length)
    expect(page.cellCount).toBe(page.rows.reduce((total, row) => total + row.cells.length, 0))
    expect(page.hasTextLayer).toBe(true)
  })

  it('gives a page with no rows (a scan) hasTextLayer: false', () => {
    const scanned: PdfDocument = { kind: 'pdf', pages: [{ number: 1, width: 595, height: 842, rows: [] }] }
    const [page] = pdfDocumentView(scanned).pages
    expect(page.hasTextLayer).toBe(false)
    expect(page.rowCount).toBe(0)
    expect(page.cellCount).toBe(0)
  })
})
