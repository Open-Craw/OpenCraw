import { z } from 'zod'

/** One cell's value, and the type the grid shows it as — mirrors `document-view/workbook-view.mapper.ts`'s `GridCellView`, the wire shape for the UI (studio plan §3.4, issue #94's 5c). */
export const gridCellViewSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  type:  z.enum(['string', 'number', 'boolean', 'date']),
})

/** One merged range, 0-based and inclusive. */
export const gridMergeViewSchema = z.object({
  ref:    z.string(),
  top:    z.number().int(),
  left:   z.number().int(),
  bottom: z.number().int(),
  right:  z.number().int(),
})

export const gridSheetViewSchema = z.object({
  name:        z.string(),
  hidden:      z.boolean(),
  hiddenRows:  z.array(z.number().int()),
  columnCount: z.number().int(),
  rows:        z.array(z.array(gridCellViewSchema)),
  merges:      z.array(gridMergeViewSchema),
})

const csvFormatViewSchema = z.object({ encoding: z.string(), delimiter: z.string() })

/** What `grid-view` answers with (studio plan §3.4, issue #94's 5c): every sheet's cells, typed, with hidden sheets/rows marked and merged ranges resolved, for the grid canvas to draw. */
export const workbookDocumentViewSchema = z.object({
  sheets: z.array(gridSheetViewSchema),
  csv:    csvFormatViewSchema.optional(),
})

export type GridCellView = z.infer<typeof gridCellViewSchema>
export type GridMergeView = z.infer<typeof gridMergeViewSchema>
export type GridSheetView = z.infer<typeof gridSheetViewSchema>
export type WorkbookDocumentView = z.infer<typeof workbookDocumentViewSchema>
