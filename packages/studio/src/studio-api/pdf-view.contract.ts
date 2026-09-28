import { z } from 'zod'

/** One text cell, in PDF points — mirrors `document-view/pdf-view.mapper.ts`'s `PdfCellView`, the wire shape for the UI (studio plan §3.4, issue #94's 5b). */
export const pdfCellViewSchema = z.object({
  x:      z.number(),
  y:      z.number(),
  width:  z.number(),
  height: z.number(),
  text:   z.string(),
})

export const pdfRowViewSchema = z.object({
  top:    z.number(),
  bottom: z.number(),
  cells:  z.array(pdfCellViewSchema),
})

export const pdfPageViewSchema = z.object({
  number:       z.number().int(),
  width:        z.number(),
  height:       z.number(),
  rows:         z.array(pdfRowViewSchema),
  rowCount:     z.number().int(),
  cellCount:    z.number().int(),
  hasTextLayer: z.boolean(),
})

/** What `pdf-view` answers with (studio plan §3.4, issue #94's 5b): every page's cells and rows, for the PDF canvas to draw over its own `pdf.js` rendering. */
export const pdfDocumentViewSchema = z.object({
  pages: z.array(pdfPageViewSchema),
})

export type PdfCellView = z.infer<typeof pdfCellViewSchema>
export type PdfRowView = z.infer<typeof pdfRowViewSchema>
export type PdfPageView = z.infer<typeof pdfPageViewSchema>
export type PdfDocumentView = z.infer<typeof pdfDocumentViewSchema>
