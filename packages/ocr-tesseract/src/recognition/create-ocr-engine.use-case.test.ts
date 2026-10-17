import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pdfPageOcr, readPdf } from '@opencraw/core'
import type { OcrEngine } from '@opencraw/core'
import { createOcrEngine } from './create-ocr-engine.use-case'

const fixtures = join(__dirname, '..', '..', '..', 'core', 'src', 'pdf-ocr', 'fixtures')
const scan = (name: string): Uint8Array => new Uint8Array(readFileSync(join(fixtures, name)))

/** The text that was drawn on every fixture, one line each (spaces between the cells collapse). */
const TABLE = ['Incentivi giugno 2026', 'Marca Modello Prezzo Sconto', 'Fiat Pandina 15950 12,5%', 'Jeep Avenger 24950 8,0%', 'Totale ordini: 1.250']

async function rowsOf (name: string, engine: OcrEngine): Promise<string[]> {
  const document = await readPdf(scan(name), name, { ocr: pdfPageOcr({ engine: () => Promise.resolve(engine) }) })

  return document.pages[0].rows.map(row => row.cells.map(cell => cell.text).join(' '))
}

describe('the Tesseract engine', () => {
  let engine: OcrEngine
  beforeAll(() => { engine = createOcrEngine() })
  afterAll(async () => { await engine.dispose?.() })

  it('reads a scanned PDF into the rows that were drawn on it', async () => {
    expect(await rowsOf('scan-clean.pdf', engine)).toEqual(TABLE)
  }, 60_000)

  it('reads cells where they sit on the page, in points from the bottom left', async () => {
    const document = await readPdf(scan('scan-clean.pdf'), 'scan-clean.pdf', { ocr: pdfPageOcr({ engine: () => Promise.resolve(engine) }) })

    const [page] = document.pages
    const brand = page.rows[2].cells.find(cell => cell.text === 'Fiat')
    // Drawn at x = 40 pt on a 420 x 595 pt page, the third line down: the engine finds it within a few points.
    expect(brand?.x).toBeGreaterThan(36)
    expect(brand?.x).toBeLessThan(48)
    expect(brand?.y).toBeGreaterThan(595 - 140)
    expect(brand?.y).toBeLessThan(595 - 90)
    // The cells of a row come left to right, as they are on the page.
    for (const row of page.rows) expect(row.cells.map(cell => cell.x)).toEqual(row.cells.map(cell => cell.x).sort((a, b) => a - b))
  }, 60_000)

  it('reads a scan that is tilted and shaded: the plain cleaning reads nothing of it, the second try, with the grain out and the ink black, reads it', async () => {
    const rows = await rowsOf('scan-crooked-shaded.pdf', engine)

    expect(rows).toHaveLength(5)
    for (const token of ['Incentivi', 'Pandina', '15950', 'Avenger', '24950', 'Totale']) expect(rows.join(' ')).toContain(token)
  }, 60_000)

  it('puts cells where they are on the tilted page, not where they would be on a straightened one', async () => {
    const document = await readPdf(scan('scan-crooked-shaded.pdf'), 'scan-crooked-shaded.pdf', { ocr: pdfPageOcr({ engine: () => Promise.resolve(engine) }) })

    const [page] = document.pages
    const first = page.rows[0].cells[0]
    const last = page.rows.at(-1)?.cells[0]
    // The page was fed in 4.5 degrees clockwise: its left margin leans, so the last line starts a few points to the left of the first. On a straightened page both would start at 40.
    expect(first.x - (last?.x ?? first.x)).toBeGreaterThan(3)
    expect(page.rows[0].top).toBeGreaterThan(page.rows.at(-1)?.top ?? 0)
  }, 60_000)

  it('reads one way of cleaning when told one, and nothing from the tilted and shaded scan when told none', async () => {
    const once = createOcrEngine({ cleanup: { binarize: 'adaptive', denoise: true } })
    try {
      const rows = await rowsOf('scan-crooked-shaded.pdf', once)
      expect(rows.join(' ')).toContain('Pandina')
    } finally {
      await once.dispose?.()
    }

    const raw = createOcrEngine({ cleanup: false })
    try {
      await expect(rowsOf('scan-crooked-shaded.pdf', raw)).rejects.toThrow('OCR found no text on any page')
    } finally {
      await raw.dispose?.()
    }
  }, 60_000)

  it('names a language whose model is not installed, and what to install', async () => {
    const italian = createOcrEngine({ languages: ['ita'] })
    try {
      await expect(rowsOf('scan-clean.pdf', italian)).rejects.toThrow(/language data for "ita" is not installed: npm install @tesseract\.js-data\/ita/)
    } finally {
      await italian.dispose?.()
    }
  }, 60_000)
})
