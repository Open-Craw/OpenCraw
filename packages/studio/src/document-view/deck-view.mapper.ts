import { rowsOfCells } from '@opencraw/core'
import type { DeckChart, DeckDocument, DeckShape, DeckSlide } from '@opencraw/core'
import type { GridSheetView } from './workbook-view.mapper'
import { workbookDocumentView } from './workbook-view.mapper'

/** One text box on a slide, in points from the slide's top-left corner — mirrors `@opencraw/core`'s `DeckShape`. */
export interface DeckShapeView {
  x:            number
  y:            number
  width:        number
  height:       number
  text:         string
  placeholder?: string
}

/** One series of a chart — mirrors `@opencraw/core`'s `DeckChart`'s own series entries. */
export interface DeckChartSeriesView {
  name:       string
  categories: string[]
  values:     (number | null)[]
}

/** One chart on a slide — mirrors `@opencraw/core`'s `DeckChart`. */
export interface DeckChartView {
  type:   string
  title?: string
  series: DeckChartSeriesView[]
}

/** One slide's geometry, tables, charts and notes for the deck canvas (studio plan §3.4, issue #94's 5d). */
export interface DeckSlideView {
  number:    number
  title?:    string
  hidden:    boolean
  /** Text boxes in reading order, ready to draw as absolutely-positioned boxes. */
  shapes:    DeckShapeView[]
  /**
   * `shapes` grouped into visual rows, left to right — indices into
   * `shapes` — the same grouping `findDeckTables`'s `shapes: true` reading
   * groups a slide's text boxes into (`rowsOfCells`, the pure algorithm
   * `@opencraw/core`'s own `deck-table.algorithm.ts`'s `shapeTables` uses).
   * The deck canvas's text-box-grid pick (issue #94's 5d) reads this to find
   * the row a clicked shape sits in, and that row's own leftmost shape's
   * text, without recomputing the grouping client-side or reaching for a
   * core-internal helper: the exact row `findDeckTables` would match a
   * `header`/`until` pattern against at run time.
   */
  shapeRows: number[][]
  /** Native tables, as the grid canvas's own sheet view (`workbook-view.mapper.ts`'s `GridSheetView`) — reused wholesale rather than a parallel shape, since a deck's native table *is* a sheet (`@opencraw/core`'s own `DeckSlide.tables`). */
  tables:    GridSheetView[]
  charts:    DeckChartView[]
  notes:     string
}

/** What `deck-view` answers with (studio plan §3.4, issue #94's 5d): the slide size in points and every slide's shapes, tables, charts and notes, for the deck canvas to draw and pick from. */
export interface DeckDocumentView {
  width:  number
  height: number
  slides: DeckSlideView[]
}

/**
 * Builds the deck canvas's view model (studio plan §3.4, issue #94's 5d)
 * from an already-read `DeckDocument` (`take-snapshot`'s cached body — no
 * second read of the file): every slide's shapes (with their visual-row
 * grouping, for the text-box-grid pick), native tables (through
 * `workbook-view.mapper.ts`'s own sheet view — a deck table *is* a sheet),
 * charts and notes. Table-specific diagnostics for a `table` extract's own
 * options (the live preview) are not here — they come from
 * `table-preview.use-case.ts`'s `previewDeckTable` instead, computed live as
 * those options change, the same split `pdf-view.mapper.ts`/`workbook-view.mapper.ts`
 * already use.
 *
 * @param document - The read deck.
 * @returns The view.
 */
export function deckDocumentView (document: DeckDocument): DeckDocumentView {
  return {
    width:  document.width,
    height: document.height,
    slides: document.slides.map(slide => slideView(slide, document.height)),
  }
}

function slideView (slide: DeckSlide, slideHeight: number): DeckSlideView {
  return {
    number:    slide.number,
    ...(slide.title !== undefined && { title: slide.title }),
    hidden:    slide.hidden,
    shapes:    slide.shapes.map(shape => shapeView(shape)),
    shapeRows: shapeRowsOf(slide.shapes, slideHeight),
    tables:    workbookDocumentView({ kind: 'workbook', sheets: slide.tables }).sheets,
    charts:    slide.charts.map(chart => chartView(chart)),
    notes:     slide.notes,
  }
}

function shapeView (shape: DeckShape): DeckShapeView {
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height, text: shape.text, ...(shape.placeholder !== undefined && { placeholder: shape.placeholder }) }
}

function chartView (chart: DeckChart): DeckChartView {
  return { type: chart.type, ...(chart.title !== undefined && { title: chart.title }), series: chart.series.map(series => ({ name: series.name, categories: [...series.categories], values: [...series.values] })) }
}

/**
 * Groups a slide's shapes into visual rows the same way `deck-table.algorithm.ts`'s
 * own (core-internal) `shapeTables` does: each shape is one cell, `y`
 * flipped to the PDF-style bottom-up convention `rowsOfCells` (and the whole
 * table-reading pipeline it feeds) works in, so the grouping this returns is
 * byte-for-byte what `findDeckTables(document, { shapes: true })` groups at
 * run time — a pick built from it matches for real, not just visually.
 *
 * @param shapes - The slide's shapes, in reading order.
 * @param slideHeight - The deck's slide height, in points (`DeckDocument.height`).
 * @returns Each row's shape indices, left to right; a blank shape (whitespace-only text) is never part of a row.
 */
function shapeRowsOf (shapes: readonly DeckShape[], slideHeight: number): number[][] {
  const indexOf = new Map<object, number>()
  const cells = shapes.flatMap((shape, index) => {
    const text = shape.text.replaceAll(/\s+/g, ' ').trim()
    if (text === '') return []
    const cell = { x: shape.x, y: slideHeight - shape.y - shape.height, width: shape.width, height: shape.height, text }
    indexOf.set(cell, index)

    return [cell]
  })

  return rowsOfCells(cells).map(row => row.cells.map(cell => indexOf.get(cell) as number))
}
