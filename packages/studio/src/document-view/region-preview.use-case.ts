import { deckRegionText, parseRegion, regionText } from '@opencraw/core'
import type { DeckDocument, DeckShape, PdfCell, PdfDocument } from '@opencraw/core'

/** One page (or slide) a `region` extract's box reads text off: the text the step binds, and what it was read from — a PDF's cells or a deck's text boxes (what the canvas highlights). */
export interface RegionPreviewMatch {
  /** The page number of a PDF, or the slide number of a deck. */
  page:   number
  text:   string
  cells:  PdfCell[]
  shapes: DeckShape[]
}

/** What a `region` extract's selector reads off the already-read document: one match per page or slide with text in the box. */
export interface RegionPreviewResult {
  matches: RegionPreviewMatch[]
  /** The selector does not parse yet (the person is still typing it, or dragging a box into shape), or names a `page=` on a deck (or a `slide=` on a PDF): reported, not thrown. */
  error?:  string
}

/**
 * Runs a `region` extract's selector against an already-read PDF or deck
 * (issues #121 and #122: the canvases' click-to-snap selection) — the
 * engine's own `regionText` / `deckRegionText`, so what the canvas
 * highlights and the text it shows are exactly what the step will read,
 * and a pure function of the document, so re-running it on every change
 * of the box costs nothing. A `slide=` on a PDF (or a `page=` on a deck)
 * is the same mismatch the step would fail with, reported as `error`.
 *
 * @param document - The read PDF or deck (`take-snapshot`'s cached body).
 * @param selector - The `region` selector, `page=1 x=72..252 y=640..664` or `slide=2 x=60..900 y=30..90`.
 * @returns The matches, or `error` when the selector does not parse or does not fit the document.
 */
export function previewRegion (document: PdfDocument | DeckDocument, selector: string): RegionPreviewResult {
  try {
    const region = parseRegion(selector)
    if (document.kind === 'pdf') {
      if (region.on !== 'page') return { matches: [], error: 'region: "slide=" reads a deck; this document is a PDF (name a "page=")' }

      return { matches: regionText(document, region).map(match => ({ page: match.page, text: match.text, cells: match.cells, shapes: [] })) }
    }
    if (region.on !== 'slide') return { matches: [], error: 'region: "page=" reads a PDF; this document is a deck (name a "slide=")' }

    return { matches: deckRegionText(document, region).map(match => ({ page: match.slide, text: match.text, cells: [], shapes: match.shapes })) }
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : String(error) }
  }
}
