import type { PdfPageHandle, PdfPageOcr, PositionedText } from '../pdf-document'
import type { OcrEngine, PdfOcr } from './ocr-engine.contract'
import { ocrDpi } from './native-dpi.client'
import { ocrRuns } from './ocr-runs.mapper'
import { renderPagePng } from './render-page.client'

/**
 * Reads a PDF page that has no text layer by OCR: renders it, has the engine read the picture, and gives the words as the text runs a text layer
 * would have.
 *
 * @param page - The pdf.js page.
 * @param pageHeight - The page's height in points.
 * @param engine - The OCR engine.
 * @param languages - The languages to read for.
 * @param dpi - The resolution to render the page at; default: the scan's own, between 150 and 300.
 * @returns The page's text runs.
 */
export async function ocrPage (page: PdfPageHandle, pageHeight: number, engine: OcrEngine, languages: readonly string[], dpi?: number): Promise<PositionedText[]> {
  const image = await renderPagePng(page, await ocrDpi(page, dpi))
  const lines = await engine.recognize(image, { languages })

  return ocrRuns(lines, image.scale, pageHeight)
}

/**
 * The way `readPdf` reads a page that has no text layer, from an OCR setting: the engine is loaded when a page first needs it, and every page read
 * goes through it.
 *
 * @param ocr - The engine (as a loader), the languages, and whether pages with text are read again.
 * @returns What `readPdf` takes as `ocr`.
 */
export function pdfPageOcr (ocr: PdfOcr): PdfPageOcr {
  return { readPage: async (page, height) => await ocrPage(page, height, await ocr.engine(), ocr.languages ?? [], ocr.dpi), ...(ocr.always !== undefined && { always: ocr.always }) }
}
