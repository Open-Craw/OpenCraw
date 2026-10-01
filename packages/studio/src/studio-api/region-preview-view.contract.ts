import { z } from 'zod'
import { pdfCellViewSchema } from './pdf-view.contract'

/** One page a `region` extract's box reads text off — mirrors `@opencraw/core`'s `PdfRegionMatch`. */
export const regionPreviewMatchSchema = z.object({
  page:  z.number().int(),
  text:  z.string(),
  cells: z.array(pdfCellViewSchema),
})

/**
 * What `region-preview` answers with (issue #121: the PDF canvas's
 * click-to-snap selection): the engine's own matches for the selector — the
 * text the step would bind, and the cells to highlight — or `error` when
 * the selector does not parse yet, reported rather than thrown.
 */
export const regionPreviewViewSchema = z.object({
  matches: z.array(regionPreviewMatchSchema),
  error:   z.string().optional(),
})

export type RegionPreviewMatchView = z.infer<typeof regionPreviewMatchSchema>
export type RegionPreviewView = z.infer<typeof regionPreviewViewSchema>
