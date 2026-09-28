import { z } from 'zod'
import { gridSheetViewSchema } from './grid-view.contract'

/** One text box on a slide, in points — mirrors `document-view/deck-view.mapper.ts`'s `DeckShapeView`, the wire shape for the UI (studio plan §3.4, issue #94's 5d). */
export const deckShapeViewSchema = z.object({
  x:           z.number(),
  y:           z.number(),
  width:       z.number(),
  height:      z.number(),
  text:        z.string(),
  placeholder: z.string().optional(),
})

const deckChartValueSchema = z.union([z.number(), z.null()])

export const deckChartSeriesViewSchema = z.object({
  name:       z.string(),
  categories: z.array(z.string()),
  values:     z.array(deckChartValueSchema),
})

export const deckChartViewSchema = z.object({
  type:   z.string(),
  title:  z.string().optional(),
  series: z.array(deckChartSeriesViewSchema),
})

const deckShapeRowSchema = z.array(z.number().int())

export const deckSlideViewSchema = z.object({
  number:    z.number().int(),
  title:     z.string().optional(),
  hidden:    z.boolean(),
  shapes:    z.array(deckShapeViewSchema),
  /** Indices into `shapes`, grouped into visual rows — see `deck-view.mapper.ts`'s own doc comment. */
  shapeRows: z.array(deckShapeRowSchema),
  tables:    z.array(gridSheetViewSchema),
  charts:    z.array(deckChartViewSchema),
  notes:     z.string(),
})

/** What `deck-view` answers with (studio plan §3.4, issue #94's 5d): the slide size in points and every slide's shapes, tables, charts and notes, for the deck canvas to draw and pick from. */
export const deckDocumentViewSchema = z.object({
  width:  z.number(),
  height: z.number(),
  slides: z.array(deckSlideViewSchema),
})

export type DeckShapeView = z.infer<typeof deckShapeViewSchema>
export type DeckChartSeriesView = z.infer<typeof deckChartSeriesViewSchema>
export type DeckChartView = z.infer<typeof deckChartViewSchema>
export type DeckSlideView = z.infer<typeof deckSlideViewSchema>
export type DeckDocumentView = z.infer<typeof deckDocumentViewSchema>
