import type { OutlineCard, PdfCellView } from '@opencraw/studio'

const DEFAULT_TABLE_ID = 'table'
const DEFAULT_REGION_ID = 'text'
/** How many of a selection's words make its default step id: enough to tell `dealerDiscountsSeptember2026` from `note`, short enough to read as a pill. */
const REGION_ID_WORDS = 4
/** Points added around a snapped cell's own box, so a cell drawn a hair wider than its text layer still sits "at least half inside" the region the engine reads. */
const CELL_BOX_PAD = 1

/** A rectangle in points — the `region` extract's own coordinate space: y growing upwards on a PDF page, downwards on a deck slide. */
export interface PointsBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * The `table` extract card's options as the PDF canvas builds them, one pick
 * at a time (studio plan §3.4, issue #94's 5b): the header row's pick gives
 * `header`, the last (a boundary/terminator) row's pick gives `until`, a
 * column band's pick adds to `columns`. Mirrors
 * `document-view/table-preview.use-case.ts`'s `TablePreviewOptions` — the
 * live preview reads the very same shape.
 */
export interface TableDraft {
  header?:  string
  until?:   string
  columns?: Record<string, string>
}

/**
 * Escapes `text` into a literal regex pattern anchored at the row's start —
 * "a pattern from the row's first cell, escaped" (issue #94's 5b): the same
 * text `readPdf`'s row joins (`plain(row)` in `pdf-table.algorithm.ts`)
 * starts with, so `^` anchoring matches this row and no other.
 *
 * @param text - The cell's (or row's) own text.
 * @returns The pattern; empty text still returns a usable (if unhelpful) `^` pattern rather than throwing.
 */
export function escapedRowPattern (text: string): string {
  return `^${escapeRegexLiteral(text.trim())}`
}

/**
 * A safe column id from a header band's own text: lowerCamelCase, ASCII
 * letters and digits only (mirrors `outline-from-pick.mapper.ts`'s own
 * "naming fields is the Record tab's job" convention — this is a usable
 * default, not a final name).
 *
 * @param headerText - The band's header cell text (`TableBandDiagnostics.name`).
 * @returns The key; `"column"` when the header has no lettersOrDigits at all.
 */
export function columnKeyFrom (headerText: string): string {
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll), same constraint steps-outline/outline-tree.ts's own Array#at comment documents.
  const words = headerText.trim().toLowerCase().replace(/[^\d a-z]/gi, ' ').trim().split(/\s+/).filter(word => word !== '')
  if (words.length === 0) return 'column'
  const [first, ...rest] = words

  return first + rest.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}

/**
 * Builds (or updates) the `table` extract card from the picks so far (issue
 * #94's 5b).
 *
 * @param draft - The picks so far; `header` must be set.
 * @param path - This node's outline path.
 * @param id - The step's own id; defaults to `"table"`.
 * @returns The outline card.
 * @throws Error when no header row has been picked yet.
 */
export function tableCardNode (draft: TableDraft, path: string, id: string = DEFAULT_TABLE_ID): OutlineCard {
  if (draft.header === undefined) throw new Error('tableCardNode: pick the header row first')
  const columns = draft.columns
  const hasColumns = columns !== undefined && Object.keys(columns).length > 0

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
      ...(draft.until !== undefined && { until: draft.until }),
      ...(hasColumns && { columns }),
    },
  }
}

/**
 * A `region` extract's selector for a box on a PDF page (issue #121) or a
 * deck slide (issue #122): whole points, ranges ordered — the same
 * `page=1 x=72..252 y=640..664` / `slide=3 x=60..900 y=30..90` shape
 * `@opencraw/core`'s own `regionSelector` writes (mirrored here: this app
 * never imports core's runtime, only `@opencraw/studio`'s types).
 *
 * @param on - `page` for a PDF (y up from the bottom), `slide` for a deck (y down from the top).
 * @param at - The 1-based page or slide number.
 * @param box - The box, in points.
 */
export function regionSelector (on: 'page' | 'slide', at: number, box: PointsBox): string {
  const [x1, x2] = ordered(box.x1, box.x2)
  const [y1, y2] = ordered(box.y1, box.y2)

  return `${on}=${String(at)} x=${String(Math.round(x1))}..${String(Math.round(x2))} y=${String(Math.round(y1))}..${String(Math.round(y2))}`
}

/** The box around one cell, padded a point on every side (see `CELL_BOX_PAD`). */
export function cellBox (cell: PdfCellView): PointsBox {
  return { x1: cell.x - CELL_BOX_PAD, y1: cell.y - CELL_BOX_PAD, x2: cell.x + Math.max(cell.width, 1) + CELL_BOX_PAD, y2: cell.y + cell.height + CELL_BOX_PAD }
}

/** The smallest box holding both: a shift+click extending a selection to a second line. */
export function unionBox (a: PointsBox, b: PointsBox): PointsBox {
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }
}

/**
 * A default step id for a selection, from its own first line: the first
 * few words in lowerCamelCase (`DEALER DISCOUNTS - SEPTEMBER 2026` →
 * `dealerDiscountsSeptember2026`), `text` when the line has no usable
 * word — the same "a usable default, not a final name" convention
 * `columnKeyFrom` follows.
 *
 * @param text - What the region reads (the preview's text).
 */
export function regionIdFrom (text: string): string {
  const [firstLine = ''] = text.split('\n', 1)
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll), same as `columnKeyFrom` above.
  const words = firstLine.trim().toLowerCase().replace(/[^\d a-z]/gi, ' ').trim().split(/\s+/).filter(word => word !== '').slice(0, REGION_ID_WORDS)
  if (words.length === 0) return DEFAULT_REGION_ID
  const [first, ...rest] = words

  return first + rest.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}

/**
 * Builds the `region` extract card for a staged selection (issue #121):
 * what "Add to recipe" appends, and what dragging the selection's chip onto
 * the Steps tab drops there.
 *
 * @param selector - The region selector ({@link regionSelector}).
 * @param path - This node's outline path.
 * @param id - The step's own id ({@link regionIdFrom}).
 */
export function regionCardNode (selector: string, path: string, id: string): OutlineCard {
  return {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id, kind: 'region', selector },
  }
}

function ordered (a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}

function escapeRegexLiteral (text: string): string {
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll).
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
