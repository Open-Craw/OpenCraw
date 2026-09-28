import type { OutlineCard } from '@opencraw/studio'
import { escapedRowPattern } from './pdf-pick.mapper'

const DEFAULT_TABLE_ID = 'table'
const DEFAULT_CHART_ID = 'value'

/**
 * The `table` extract card's options as the deck canvas builds them, one
 * pick at a time (studio plan §3.4, issue #94's 5d): a native table's header
 * row pick gives `slide` (the current slide's title, scoping the read to it)
 * and `header`; the last non-data row's pick gives `until`; a column's pick
 * adds to `columns`; a merged group's label pick adds to `fillDown`
 * (native tables only — mirrors `grid-pick.mapper.ts`'s own picks over a
 * sheet, since a deck's native table *is* a sheet). A text-box grid's header
 * row pick sets `shapes: true` instead. Mirrors `pdf-pick.mapper.ts`'s
 * `TableDraft`/`grid-pick.mapper.ts`'s `GridDraft` and
 * `document-view/table-preview.use-case.ts`'s `DeckTablePreviewOptions` —
 * the live preview reads the very same shape.
 */
export interface DeckDraft {
  slide?:          string
  shapes?:         boolean
  header?:         string
  /** The picked header block's first row index (0-based, within the active source's own rows) — UI bookkeeping only, never sent in the outline card. */
  headerRowIndex?: number
  headerRows?:     number
  until?:          string
  columns?:        Record<string, string>
  fillDown?:       string[]
  includeHidden?:  boolean
}

/**
 * An exact-match slide-title pattern from the current slide (issue #94's
 * 5d): anchored at both ends, so `slide` matches this slide and no other
 * whose title happens to start the same way — mirrors `grid-pick.mapper.ts`'s
 * own `sheetPattern`.
 *
 * @param title - The slide's own title; `''` for a slide with none (an anchored empty pattern still matches it and no titled slide).
 * @returns The pattern.
 */
export function slidePattern (title: string): string {
  return `${escapedRowPattern(title)}$`
}

/**
 * Builds (or updates) the `table` extract card from the picks so far (issue
 * #94's 5d). Mirrors `pdf-pick.mapper.ts`'s `tableCardNode`/`grid-pick.mapper.ts`'s
 * `gridTableCardNode`.
 *
 * @param draft - The picks so far; `header` must be set.
 * @param path - This node's outline path.
 * @param id - The step's own id; defaults to `"table"`.
 * @returns The outline card.
 * @throws Error when no header row has been picked yet.
 */
export function deckTableCardNode (draft: DeckDraft, path: string, id: string = DEFAULT_TABLE_ID): OutlineCard {
  if (draft.header === undefined) throw new Error('deckTableCardNode: pick the header row first')
  const columns = draft.columns
  const hasColumns = columns !== undefined && Object.keys(columns).length > 0
  const hasFillDown = draft.fillDown !== undefined && draft.fillDown.length > 0

  return {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     {
      type:     'extract',
      id,
      kind:     'table',
      selector: draft.header,
      ...(draft.slide !== undefined && { slide: draft.slide }),
      ...(draft.shapes === true && { shapes: true }),
      ...(draft.until !== undefined && { until: draft.until }),
      ...(hasColumns && { columns }),
      ...(draft.headerRows !== undefined && draft.headerRows > 1 && { headerRows: draft.headerRows }),
      ...(hasFillDown && { fillDown: draft.fillDown }),
      ...(draft.includeHidden === true && { includeHidden: true }),
    },
  }
}

/**
 * Builds a `jsonpath` extract card from a chart pick (issue #94's 5d): the
 * exact address of the chart's own `series` in the deck document
 * (`$.slides[<index>].charts[<index>].series`) — a `jsonpath` extract on a
 * deck document reads the document itself, not a `.data` field (`@opencraw/core`'s
 * `extractFromDocument`), so this addresses the very object `deck-view`'s
 * `deckDocumentView` built its `DeckSlideView`/`DeckChartView` from. The
 * selector matches exactly one JSON node — the series array itself, not a
 * wildcard over several matches — so this is a single (`many` absent), not
 * a list, pick: the field binds to that whole array, ready for a `forEach`
 * over it. `take: "json"` keeps it an array of objects (`take: "text"`, the
 * default, would `JSON.stringify` it into one string instead).
 *
 * @param slideIndex - The chart's slide's own index into `DeckDocument.slides` (its array position, not `slide.number` — the two agree only when every slide the recipe reads is present and in order).
 * @param chartIndex - The chart's own index into that slide's `charts`.
 * @param path - This node's outline path.
 * @param id - The step's own id; defaults to `"value"`, the same convention `outline-from-pick.mapper.ts`'s `readCardNode` uses.
 * @returns The outline card.
 */
export function deckChartCardNode (slideIndex: number, chartIndex: number, path: string, id: string = DEFAULT_CHART_ID): OutlineCard {
  const selector = `$.slides[${String(slideIndex)}].charts[${String(chartIndex)}].series`

  return {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id, selector, kind: 'jsonpath', take: 'json' },
  }
}

export { columnKeyFrom, escapedRowPattern } from './pdf-pick.mapper'
export { columnHeaderText, fillDownKeyFor, filledGridOf, rowPickText } from './grid-pick.mapper'
