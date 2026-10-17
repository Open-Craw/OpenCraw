import type { PdfPageHandle } from '../pdf-document'
import { DEFAULT_DPI } from './render-page.client'

/** Below this the scan is too coarse for any reading to gain from being rendered smaller: pages are read at least this sharply. */
const MIN_DPI = 150

/** The names of the operators that paint a picture. */
const PICTURE_OPERATORS = new Set(['paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintJpegXObject'])

/**
 * The resolution to render a page for OCR at. A scan is read best at its own resolution: rendered larger, a soft picture only gets blurrier
 * (Tesseract reads a 144 dpi scan well at 150 and not at all at 300), rendered smaller, it loses detail. So the page's largest picture says
 * (its pixels across the page's width), held between 150 and 300 dpi; a page with no picture (text drawn as outlines) is read at 300.
 *
 * @param page - The pdf.js page.
 * @param requested - A resolution the recipe asked for, used as it is.
 * @returns The dots per inch to render at.
 */
export async function ocrDpi (page: PdfPageHandle, requested?: number): Promise<number> {
  if (requested !== undefined) return requested
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const operators = await page.getOperatorList()
  const names = new Map(Object.entries(pdfjs.OPS).map(([name, code]) => [code, name]))
  const { width, height } = page.getViewport({ scale: 1 })
  let widest = 0
  for (const [index, code] of operators.fnArray.entries()) {
    if (!PICTURE_OPERATORS.has(names.get(code) ?? '')) continue
    const [, across, down] = (operators.argsArray[index] ?? []) as [unknown, unknown, unknown]
    if (typeof across === 'number' && typeof down === 'number' && across > 0 && down > 0) widest = Math.max(widest, Math.max((across / width), (down / height)) * 72)
  }

  return widest === 0 ? DEFAULT_DPI : Math.round(Math.min(DEFAULT_DPI, Math.max(MIN_DPI, widest)))
}
