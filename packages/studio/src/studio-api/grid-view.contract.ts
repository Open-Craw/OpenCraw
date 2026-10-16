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
  name:               z.string(),
  hidden:             z.boolean(),
  hiddenRows:         z.array(z.number().int()),
  columnCount:        z.number().int(),
  rows:               z.array(z.array(gridCellViewSchema)),
  /** How many rows the sheet has, set only when `rows` holds just the first window of them (a big file); the rest come from `grid-rows`. */
  rowCount:           z.number().int().optional(),
  merges:             z.array(gridMergeViewSchema),
  /** Column widths in characters by 0-based column, as the spreadsheet stores them (absent for a CSV, and for a column the file does not size). */
  columnWidths:       z.record(z.string(), z.number()).optional(),
  /** Row heights in points by 0-based row, as the spreadsheet stores them. */
  rowHeights:         z.record(z.string(), z.number()).optional(),
  /** The width of a column the file does not size, in characters. */
  defaultColumnWidth: z.number().optional(),
  /** The height of a row the file does not size, in points. */
  defaultRowHeight:   z.number().optional(),
})

/** What `grid-rows` answers with: a run of one sheet's rows. */
export const gridRowsViewSchema = z.object({ rows: z.array(z.array(gridCellViewSchema)) })

const csvFormatViewSchema = z.object({ encoding: z.string(), delimiter: z.string() })

/** What `grid-view` answers with (studio plan §3.4, issue #94's 5c): every sheet's cells, typed, with hidden sheets/rows marked and merged ranges resolved, for the grid canvas to draw. */
export const workbookDocumentViewSchema = z.object({
  sheets: z.array(gridSheetViewSchema),
  csv:    csvFormatViewSchema.optional(),
})

export type GridRowsView = z.infer<typeof gridRowsViewSchema>
export type GridCellView = z.infer<typeof gridCellViewSchema>
export type GridMergeView = z.infer<typeof gridMergeViewSchema>
export type GridSheetView = z.infer<typeof gridSheetViewSchema>
export type WorkbookDocumentView = z.infer<typeof workbookDocumentViewSchema>
