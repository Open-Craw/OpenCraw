import { z } from 'zod'
import { deckShapeViewSchema } from './deck-view.contract'
import { pdfCellViewSchema } from './pdf-view.contract'

/** One page of a PDF, or one slide of a deck, a `region` extract's box reads text off — mirrors `document-view/region-preview.use-case.ts`'s `RegionPreviewMatch`: `cells` for a PDF, `shapes` for a deck, the other empty. */
export const regionPreviewMatchSchema = z.object({
  /** The page number of a PDF, or the slide number of a deck. */
  page:   z.number().int(),
  text:   z.string(),
  cells:  z.array(pdfCellViewSchema),
  shapes: z.array(deckShapeViewSchema),
})

/**
 * What `region-preview` answers with (issues #121 and #122: the PDF and
 * deck canvases' click-to-snap selection): the engine's own matches for
 * the selector — the text the step would bind, and the cells or text boxes
 * to highlight — or `error` when the selector does not parse yet, or names
 * the other document's keyword, reported rather than thrown.
 */
export const regionPreviewViewSchema = z.object({
  matches: z.array(regionPreviewMatchSchema),
  error:   z.string().optional(),
})

export type RegionPreviewMatchView = z.infer<typeof regionPreviewMatchSchema>
export type RegionPreviewView = z.infer<typeof regionPreviewViewSchema>
