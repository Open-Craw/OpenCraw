import { z } from 'zod'

const gridPreviewRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

/** One table matched by a `table` extract's options against a workbook — mirrors `@opencraw/core`'s `GridTable`. */
export const gridTablePreviewMatchSchema = z.object({
  sheet:  z.string(),
  title:  z.string(),
  header: z.array(z.string()),
  rows:   z.array(gridPreviewRowSchema),
})

/**
 * What `grid-preview` answers with (studio plan §3.4, issue #94's 5c: the
 * live preview): every matched table, or `error` when a pattern in the
 * options does not compile — expected while the person is still typing it,
 * not thrown.
 */
export const gridTablePreviewViewSchema = z.object({
  matches: z.array(gridTablePreviewMatchSchema),
  error:   z.string().optional(),
})

export type GridTablePreviewMatchView = z.infer<typeof gridTablePreviewMatchSchema>
export type GridTablePreviewView = z.infer<typeof gridTablePreviewViewSchema>
