import { z } from 'zod'

const tablePreviewRowSchema = z.record(z.string(), z.string())

/** One table matched by a `table` extract's options — mirrors `@opencraw/core`'s `PdfTable`. */
export const tablePreviewTableSchema = z.object({
  page:   z.number().int(),
  title:  z.string(),
  header: z.array(z.string()),
  rows:   z.array(tablePreviewRowSchema),
})

/** One column band a matched table's body clustered into — mirrors `@opencraw/core`'s `TableBandDiagnostics`. */
export const tablePreviewBandSchema = z.object({
  start:  z.number(),
  end:    z.number(),
  column: z.number().int(),
  name:   z.string(),
})

/** One matched table, with the exact page rows to highlight — mirrors `document-view/table-preview.use-case.ts`'s `TablePreviewMatch`. */
export const tablePreviewMatchSchema = z.object({
  page:              z.number().int(),
  headerRowIndex:    z.number().int(),
  matchedRowIndices: z.array(z.number().int()),
  bands:             z.array(tablePreviewBandSchema),
  bandTolerance:     z.number(),
  table:             tablePreviewTableSchema,
})

/**
 * What `table-preview` answers with (studio plan §3.4, issue #94's 5b: the
 * live preview): every match, or `error` when a pattern in the options does
 * not compile — expected while the person is still typing it, not thrown.
 */
export const tablePreviewViewSchema = z.object({
  matches: z.array(tablePreviewMatchSchema),
  error:   z.string().optional(),
})

export type TablePreviewTableView = z.infer<typeof tablePreviewTableSchema>
export type TablePreviewBandView = z.infer<typeof tablePreviewBandSchema>
export type TablePreviewMatchView = z.infer<typeof tablePreviewMatchSchema>
export type TablePreviewView = z.infer<typeof tablePreviewViewSchema>
