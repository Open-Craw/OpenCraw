import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPdf } from '../pdf-document'
import { pdfPageOcr } from './ocr-page.use-case'
import type { OcrEngine, OcrLine, OcrOptions, OcrPageImage } from './ocr-engine.contract'

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47]

/** An engine that reads what it is told to, and remembers the pictures and options it was given. */
function fakeEngine (lines: OcrLine[]): OcrEngine & { seen: { image: OcrPageImage, options: OcrOptions }[] } {
  const seen: { image: OcrPageImage, options: OcrOptions }[] = []

  return {
    name:      'fake',
    seen,
    recognize: (image, options) => {
      seen.push({ image, options })

      return Promise.resolve(lines)
    },
  }
}

const word = (text: string, x0: number, y0: number, x1: number, y1: number): OcrLine['words'][number] => ({ text, x0, y0, x1, y1, confidence: 95 })

describe('reading a scanned PDF by OCR', () => {
  const scan = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'scan-clean.pdf')))

  it('is refused without OCR, saying it is a scan and what to do', async () => {
    await expect(readPdf(scan, 'scan.pdf')).rejects.toThrow(/scan\.pdf: no page has a text layer: it is a scan\. Read it with OCR/)
  })

  it('renders the page, gives the engine its picture, and reads the words as rows and cells in points', async () => {
    const engine = fakeEngine([
      { words: [word('Model', 150, 200, 280, 240), word('Price', 700, 200, 820, 240)] },
      { words: [word('Pandina', 150, 300, 330, 340), word('15950', 700, 300, 820, 340)] },
    ])

    const document = await readPdf(scan, 'scan.pdf', { ocr: pdfPageOcr({ engine: () => Promise.resolve(engine), languages: ['eng', 'ita'] }) })

    const [page] = document.pages
    expect([page.width, page.height]).toEqual([420, 595])
    expect(page.rows.map(row => row.cells.map(cell => cell.text))).toEqual([['Model', 'Price'], ['Pandina', '15950']])
    const [first] = page.rows
    expect(first.cells[0].x).toBeCloseTo(60, 5)
    expect(first.cells[1].x).toBeCloseTo(280, 5)
    expect(first.cells[0].y).toBeCloseTo(595 - 96, 5)
    expect(engine.seen).toHaveLength(1)
    expect([...engine.seen[0].image.png.subarray(0, 4)]).toEqual(PNG_SIGNATURE)
    // The scan is 1050 pixels across 420 points: 180 dpi, and that is what it is read at.
    expect(engine.seen[0].image.scale).toBeCloseTo(2.5, 5)
    expect([engine.seen[0].image.width, engine.seen[0].image.height]).toEqual([1050, 1488])
    expect(engine.seen[0].options.languages).toEqual(['eng', 'ita'])
  })

  it('loads the engine only when a page needs it', async () => {
    let loaded = 0
    const ocr = pdfPageOcr({
      engine: () => {
        loaded += 1

        return Promise.resolve(fakeEngine([{ words: [word('x', 0, 0, 10, 20)] }]))
      },
    })
    const withText = readFileSync(join(__dirname, '..', 'pdf-document', 'fixtures', 'discounts.pdf'))

    await readPdf(new Uint8Array(withText), 'discounts.pdf', { ocr })
    expect(loaded).toBe(0)
    await readPdf(scan, 'scan.pdf', { ocr })
    expect(loaded).toBe(1)
  })

  it('leaves the pages that have text as they are, unless every page is to be read by OCR', async () => {
    const withText = new Uint8Array(readFileSync(join(__dirname, '..', 'pdf-document', 'fixtures', 'discounts.pdf')))
    const plain = await readPdf(withText, 'discounts.pdf')
    const engine = fakeEngine([{ words: [word('replaced', 100, 100, 300, 140)] }])

    const untouched = await readPdf(withText, 'discounts.pdf', { ocr: pdfPageOcr({ engine: () => Promise.resolve(engine) }) })
    const forced = await readPdf(withText, 'discounts.pdf', { ocr: pdfPageOcr({ engine: () => Promise.resolve(engine), always: true }) })

    expect(untouched).toEqual(plain)
    expect(forced.pages[0].rows.map(row => row.text)).toEqual(['replaced'])
  })

  it('says so when OCR finds nothing on any page', async () => {
    await expect(readPdf(scan, 'scan.pdf', { ocr: pdfPageOcr({ engine: () => Promise.resolve(fakeEngine([])) }) })).rejects.toThrow('scan.pdf: no page has a text layer, and OCR found no text on any page')
  })
})
