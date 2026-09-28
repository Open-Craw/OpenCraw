import type { OutlineCard } from '@opencraw/studio'

const DEFAULT_TABLE_ID = 'table'
const DEFAULT_REGEX_ID = 'value'

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
 * Builds a `regex` extract card from a dragged region (issue #94's 5b): the
 * covered rows' own text (space-joined cells, tab in the real document —
 * either escapes to the same thing a person can read and edit), newline
 * between rows, escaped into a literal starting pattern — a candidate to
 * edit into a real pattern, not a guess at what varies, the same "safe
 * starting point" `readCardNode` gives a DOM pick.
 *
 * @param rowTexts - The dragged rows' own text, top to bottom.
 * @param path - This node's outline path.
 * @param id - The step's own id; defaults to `"value"`.
 * @returns The outline card.
 * @throws Error when no row is covered by the drag.
 */
export function regexCardNode (rowTexts: readonly string[], path: string, id: string = DEFAULT_REGEX_ID): OutlineCard {
  if (rowTexts.length === 0) throw new Error('regexCardNode: the dragged region covers no row')
  const pattern = rowTexts.map(text => escapeRegexLiteral(text.trim())).join(String.raw`\n`)

  return {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id, kind: 'regex', selector: pattern },
  }
}

function escapeRegexLiteral (text: string): string {
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll).
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
