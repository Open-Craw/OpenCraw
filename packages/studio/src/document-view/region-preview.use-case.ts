import { parseRegion, regionText } from '@opencraw/core'
import type { PdfDocument, PdfRegionMatch } from '@opencraw/core'

/** What a `region` extract's selector reads off the already-read PDF: one match per page with text in the box, the cells it was read from included (what the canvas highlights). */
export interface RegionPreviewResult {
  matches: PdfRegionMatch[]
  /** The selector does not parse yet (the person is still typing it, or dragging a box into shape): reported, not thrown. */
  error?:  string
}

/**
 * Runs a `region` extract's selector against an already-read PDF (issue
 * #121: the PDF canvas's click-to-snap selection) — the engine's own
 * `regionText`, so what the canvas highlights and the text it shows are
 * exactly what the step will read, and a pure function of the document, so
 * re-running it on every change of the box costs nothing.
 *
 * @param document - The read PDF (`take-snapshot`'s cached body).
 * @param selector - The `region` selector, `page=1 x=72..252 y=640..664`.
 * @returns The matches, or `error` when the selector does not parse.
 */
export function previewPdfRegion (document: PdfDocument, selector: string): RegionPreviewResult {
  try {
    return { matches: regionText(document, parseRegion(selector)) }
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : String(error) }
  }
}
