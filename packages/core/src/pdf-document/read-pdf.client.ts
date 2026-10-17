import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfDocument, PdfPage, PositionedText } from './pdf-document.model'
import { assembleRows } from './row-assembly.algorithm'

/** A PDF that cannot be read: not a PDF, encrypted, or with no text to read. */
export class PdfReadError extends Error {
  override readonly name = 'PdfReadError'
}

/** A page as pdf.js gives it. */
export type PdfPageHandle = Awaited<ReturnType<PDFDocumentProxy['getPage']>>

/** How to read a page that has no text layer: render it and read its picture. */
export interface PdfPageOcr {
  /** The text runs of the page, read from its picture; `height` is the page's height in points. */
  readPage: (page: PdfPageHandle, height: number) => Promise<PositionedText[]>
  /** Read every page this way and drop the text layer, for a PDF whose text layer is wrong. Default: only the pages with no text. */
  always?:  boolean
}

/** How to read a PDF beyond its text layer. */
export interface ReadPdfOptions {
  /** Read the pages that have no text layer (a scan) by OCR, or every page with `always`. Without it a PDF with no text at all is refused. */
  ocr?: PdfPageOcr
}

/**
 * Reads a PDF's text layer into rows of positioned cells, with pdf.js. pdf.js
 * is imported on first use, so recipes that never read a PDF never load it.
 * Only text is read: no page is rendered, no script runs, no font is loaded, unless a page is read by
 * OCR (`options.ocr`): then that page, a scan with no text layer, is rendered and its picture read, and its
 * words come back as the runs a text layer would have given.
 *
 * @param bytes - The file.
 * @param source - Where it came from, for messages.
 * @param options - OCR, for a scanned PDF.
 * @returns The document.
 * @throws PdfReadError when the bytes are not a readable PDF, or no page has any text: no text layer
 * and no OCR asked for (a scan), or an OCR that found nothing.
 */
export async function readPdf (bytes: Uint8Array, source = 'PDF', options: ReadPdfOptions = {}): Promise<PdfDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdf.js takes ownership of the buffer it is given, and refuses a Node
  // Buffer: hand it a plain copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, disableFontFace: true, useSystemFonts: false, stopAtErrors: true })
  let loaded: Awaited<typeof task.promise>
  try {
    loaded = await task.promise
  } catch (error) {
    throw new PdfReadError(`${source}: not a readable PDF (${(error as Error).message})`, { cause: error })
  }
  try {
    const pages: PdfPage[] = []
    for (let number = 1; number <= loaded.numPages; number += 1) {
      const page = await loaded.getPage(number)
      const { width, height } = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      let runs = content.items.flatMap(item => ('str' in item ? [runOf(item)] : []))
      const { ocr } = options
      if (ocr !== undefined && (ocr.always === true || runs.every(run => run.text.trim() === ''))) runs = await ocr.readPage(page, height)
      pages.push({ number, width, height, rows: assembleRows(runs) })
    }
    if (pages.every(page => page.rows.length === 0)) {
      throw new PdfReadError(options.ocr === undefined
        ? `${source}: no page has a text layer: it is a scan. Read it with OCR ("ocr": true on the request step; it needs @opencraw/ocr-tesseract)`
        : `${source}: no page has a text layer, and OCR found no text on any page`)
    }

    return { kind: 'pdf', pages }
  } finally {
    await task.destroy()
  }
}

function runOf (item: { str: string, transform: number[], width: number, height: number }): PositionedText {
  const [a, b, c, d, x, y] = item.transform

  return { x, y, width: item.width, height: item.height > 0 ? item.height : Math.hypot(c, d) || Math.hypot(a, b), text: item.str }
}
