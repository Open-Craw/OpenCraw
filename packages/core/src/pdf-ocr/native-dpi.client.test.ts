import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ocrDpi } from './native-dpi.client'
import type { PdfPageHandle } from '../pdf-document'

async function firstPage (path: string[]): Promise<{ page: PdfPageHandle, destroy: () => Promise<void> }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const bytes = readFileSync(join(__dirname, ...path))
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  const document = await task.promise

  return { page: await document.getPage(1), destroy: async () => { await task.destroy() } }
}

describe('ocrDpi', () => {
  it('is the scan\'s own resolution: the pixels of its picture across the width of the page', async () => {
    const clean = await firstPage(['fixtures', 'scan-clean.pdf'])
    const poor = await firstPage(['fixtures', 'scan-poor.pdf'])

    expect(await ocrDpi(clean.page)).toBe(180)
    // 840 pixels across 420 points is 144 dpi: held at the 150 floor.
    expect(await ocrDpi(poor.page)).toBe(150)
    await clean.destroy()
    await poor.destroy()
  })

  it('is 300 for a page with no picture, and what was asked for when something was', async () => {
    const text = await firstPage(['..', 'pdf-document', 'fixtures', 'discounts.pdf'])
    const clean = await firstPage(['fixtures', 'scan-clean.pdf'])

    expect(await ocrDpi(text.page)).toBe(300)
    expect(await ocrDpi(clean.page, 220)).toBe(220)
    await text.destroy()
    await clean.destroy()
  })
})
