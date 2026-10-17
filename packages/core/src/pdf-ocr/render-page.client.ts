import type { PdfPageHandle } from '../pdf-document'
import type { OcrPageImage } from './ocr-engine.contract'

/** A PDF point is 1/72 inch: the pixels to each point of a page rendered at this many dots per inch. */
export function scaleOfDpi (dpi: number): number {
  return dpi / 72
}

/** 300 dpi, what Tesseract is trained for: text a few points tall still has glyphs it can read, and most scans are at least this sharp. */
export const DEFAULT_DPI = 300

/** The widest side a rendered page may have, in pixels: a poster or a very large MediaBox is scaled down to this. */
const MAX_SIDE = 6000

/**
 * Renders a PDF page to a PNG with pdf.js and `@napi-rs/canvas` (the canvas pdf.js itself uses in Node), the way a scanner would give it: only
 * the page's pictures and drawing matter here, so a scan comes out as the scan.
 *
 * @param page - The pdf.js page.
 * @param dpi - Dots per inch to render at; default {@link DEFAULT_DPI}, lowered for a page so big its longer side would pass 6000 pixels.
 * @returns The page's image.
 * @throws Error when `@napi-rs/canvas` cannot be loaded (its native part is missing for this system).
 */
export async function renderPagePng (page: PdfPageHandle, dpi = DEFAULT_DPI): Promise<OcrPageImage> {
  const natural = page.getViewport({ scale: 1 })
  const effective = Math.min(scaleOfDpi(dpi), MAX_SIDE / Math.max(natural.width, natural.height))
  const viewport = page.getViewport({ scale: effective })
  const { createCanvas } = await import('@napi-rs/canvas')
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  // The canvas is @napi-rs/canvas's: the one pdf.js itself uses in Node, whose types are not the DOM's.
  await page.render({ canvasContext: canvas.getContext('2d') as never, canvas: canvas as never, viewport }).promise

  return { png: canvas.toBuffer('image/png'), width: canvas.width, height: canvas.height, scale: effective }
}
