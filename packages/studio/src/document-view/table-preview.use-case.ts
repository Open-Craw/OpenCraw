import { analyzeTables, findDeckTables, findGridTables } from '@opencraw/core'
import type { DeckDocument, GridTableQuery, PdfDocument, PdfTable, TableAlign, TableBandDiagnostics, WorkbookCell, WorkbookDocument } from '@opencraw/core'

/**
 * A `table` extract's own options, as the studio's picks build them: string
 * patterns, not yet compiled — the same shape `ExtractStep`'s `table`-kind
 * fields have, kept separate so this slice does not import the engine's
 * recipe schema for one interface.
 */
export interface TablePreviewOptions {
  /** Matches the header row (the recipe's `selector`). */
  header:   string
  /** Matches the row that ends the table. */
  until?:   string
  /** Output key -> a pattern for that column's header cell. */
  columns?: Record<string, string>
  align?:   TableAlign
}

/** One matched table, with the exact rows to highlight on the page. */
export interface TablePreviewMatch {
  page:              number
  /** Index into that page's rows of the header row. */
  headerRowIndex:    number
  /** Every row index (into that page's rows) this match highlights: the header, every regrouped body row, and the `until` row when there is one — sorted, deduplicated. */
  matchedRowIndices: number[]
  /** The column bands the body's cells clustered into, left to right — a column band pick reads its `name` (issue #94's 5b). */
  bands:             TableBandDiagnostics[]
  /** The gap (in points) two cell edges may differ by and still share a band — shown while dragging a band edge. */
  bandTolerance:     number
  table:             PdfTable
}

/** What `previewPdfTable` answers with: either the matches, or, when a pattern does not compile, why. */
export interface TablePreviewResult {
  matches: TablePreviewMatch[]
  error?:  string
}

/**
 * Runs a `table` extract's options against an already-read PDF (studio plan
 * §3.4, issue #94's 5b: the live preview) — a pure function of the document
 * and the options, so re-running it on every keystroke as the person edits
 * `selector`/`until`/`columns` costs nothing: no re-fetch, no re-parse
 * (`readPdf` already ran once, when `take-snapshot` captured the document).
 *
 * The workbook grid's live preview (issue #94's 5c) is `previewGridTable`,
 * below: the same idea (a pure re-run of the options against the cached
 * document), but its own result shape — a workbook table has no page, no
 * column bands, no wrapped-row regrouping, so folding it into
 * `TablePreviewMatch`/`TablePreviewResult` would leave most of those fields
 * meaningless for a grid pick; a `GridTablePreviewMatch`/`GridTablePreviewResult`
 * sibling reads honestly instead.
 *
 * @param document - The already-read PDF.
 * @param options - The `table` extract's options, not yet compiled to `RegExp`.
 * @returns Every match, each with the exact row indices to highlight — or `error` (and no matches) when a pattern is not a valid regular expression, expected while the person is still typing it.
 */
export function previewPdfTable (document: PdfDocument, options: TablePreviewOptions): TablePreviewResult {
  let query: { header: RegExp, until?: RegExp, columns?: Record<string, RegExp>, align?: TableAlign }
  try {
    query = {
      header:  compile(options.header, 'selector'),
      until:   options.until === undefined ? undefined : compile(options.until, 'until'),
      columns: options.columns === undefined ? undefined : Object.fromEntries(Object.entries(options.columns).map(([key, pattern]) => [key, compile(pattern, `columns.${key}`)])),
      align:   options.align,
    }
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : String(error) }
  }
  const analyses = analyzeTables(document, query)

  return {
    matches: analyses.map(analysis => ({
      page:              analysis.page,
      headerRowIndex:    analysis.headerRowIndex,
      matchedRowIndices: rowIndicesOf(analysis),
      bands:             analysis.bands,
      bandTolerance:     analysis.bandTolerance,
      table:             analysis.table,
    })),
  }
}

function rowIndicesOf (analysis: { headerRowIndex: number, rowGroups: number[][], untilRowIndex?: number }): number[] {
  const indices = new Set([analysis.headerRowIndex, ...analysis.rowGroups.flat()])
  if (analysis.untilRowIndex !== undefined) indices.add(analysis.untilRowIndex)

  return [...indices].sort((a, b) => a - b)
}

function compile (source: string, where: string): RegExp {
  try {
    return new RegExp(source, 'i')
  } catch (error) {
    throw new Error(`${where}: invalid pattern ${source} (${(error as Error).message})`, { cause: error })
  }
}

/**
 * A `table` extract's own options for a workbook (CSV or spreadsheet), as
 * the studio's grid canvas picks build them (issue #94's 5c) — mirrors
 * `@opencraw/core`'s `GridTableQuery`, kept as strings (not yet compiled)
 * the same way `TablePreviewOptions` does for PDF.
 */
export interface GridTablePreviewOptions {
  /** Matches the names of the sheets to read; default every sheet. */
  sheet?:         string
  /** Matches the header row (the recipe's `selector`). */
  header:         string
  /** Matches the row that ends the table. */
  until?:         string
  /** Output key -> a pattern for that column's header cell. */
  columns?:       Record<string, string>
  /** How many rows the header spans; default 1. */
  headerRows?:    number
  /** Output keys whose empty cells take the value of the row above (a merged-group label pick, issue #94's 5c). */
  fillDown?:      string[]
  /** Read hidden sheets and rows too. */
  includeHidden?: boolean
}

/** One table matched by a `table` extract's options against a workbook — mirrors `@opencraw/core`'s `GridTable`. */
export interface GridTablePreviewMatch {
  sheet:  string
  title:  string
  header: string[]
  rows:   Record<string, WorkbookCell>[]
}

/** What `previewGridTable` answers with: either the matches, or, when a pattern does not compile, why (mirrors `TablePreviewResult`). */
export interface GridTablePreviewResult {
  matches: GridTablePreviewMatch[]
  error?:  string
}

/**
 * Runs a `table` extract's options against an already-read workbook (studio
 * plan §3.4, issue #94's 5c: the live preview) — a pure function of the
 * document and the options, exactly like `previewPdfTable` above: no
 * re-fetch, no re-parse (`csvWorkbook`/`readXlsxWorkbook` already ran once,
 * when `take-snapshot` captured the document).
 *
 * @param document - The already-read workbook.
 * @param options - The `table` extract's options, not yet compiled to `RegExp`.
 * @returns Every matched table — or `error` (and no matches) when a pattern is not a valid regular expression, expected while the person is still typing it.
 */
export function previewGridTable (document: WorkbookDocument, options: GridTablePreviewOptions): GridTablePreviewResult {
  let query: GridTableQuery
  try {
    query = {
      header:        compile(options.header, 'selector'),
      until:         options.until === undefined ? undefined : compile(options.until, 'until'),
      columns:       options.columns === undefined ? undefined : Object.fromEntries(Object.entries(options.columns).map(([key, pattern]) => [key, compile(pattern, `columns.${key}`)])),
      sheet:         options.sheet === undefined ? undefined : compile(options.sheet, 'sheet'),
      headerRows:    options.headerRows,
      fillDown:      options.fillDown,
      includeHidden: options.includeHidden,
    }
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : String(error) }
  }
  const tables = findGridTables(document, query)

  return { matches: tables.map(table => ({ sheet: table.sheet, title: table.title, header: table.header, rows: table.rows })) }
}

/**
 * A `table` extract's own options for a deck, as the studio's deck canvas
 * picks build them (issue #94's 5d) — mirrors `@opencraw/core`'s
 * `DeckTableQuery`, kept as strings (not yet compiled) the same way
 * `TablePreviewOptions`/`GridTablePreviewOptions` do for PDF/workbook.
 */
export interface DeckTablePreviewOptions {
  /** Matches the titles of the slides to read; default every slide. */
  slide?:         string
  /** Read text boxes laid out as a table instead of native tables. */
  shapes?:        boolean
  /** With `shapes`: how a row's values sit against a box wrapped over several lines. */
  align?:         TableAlign
  /** Matches the header row (the recipe's `selector`). */
  header:         string
  /** Matches the row that ends the table. */
  until?:         string
  /** Output key -> a pattern for that column's header cell. */
  columns?:       Record<string, string>
  /** How many rows the header spans; default 1 (native tables only). */
  headerRows?:    number
  /** Output keys whose empty cells take the value of the row above (native tables only). */
  fillDown?:      string[]
  /** Read hidden slides too. */
  includeHidden?: boolean
}

/** One table matched by a `table` extract's options against a deck — mirrors `@opencraw/core`'s `DeckTable`. */
export interface DeckTablePreviewMatch {
  slide:      number
  slideTitle: string
  title:      string
  header:     string[]
  rows:       Record<string, WorkbookCell>[]
}

/** What `previewDeckTable` answers with: either the matches, or, when a pattern does not compile, why (mirrors `TablePreviewResult`/`GridTablePreviewResult`). */
export interface DeckTablePreviewResult {
  matches: DeckTablePreviewMatch[]
  error?:  string
}

/**
 * Runs a `table` extract's options against an already-read deck (studio plan
 * §3.4, issue #94's 5d: the live preview) — a pure function of the document
 * and the options, exactly like `previewPdfTable`/`previewGridTable` above:
 * no re-fetch, no re-parse (`readPptxDeck` already ran once, when
 * `take-snapshot` captured the document).
 *
 * @param document - The already-read deck.
 * @param options - The `table` extract's options, not yet compiled to `RegExp`.
 * @returns Every matched table — or `error` (and no matches) when a pattern is not a valid regular expression, expected while the person is still typing it.
 */
export function previewDeckTable (document: DeckDocument, options: DeckTablePreviewOptions): DeckTablePreviewResult {
  let query: { slide?: RegExp, shapes?: boolean, align?: TableAlign, header: RegExp, until?: RegExp, columns?: Record<string, RegExp>, headerRows?: number, fillDown?: string[], includeHidden?: boolean }
  try {
    query = {
      slide:         options.slide === undefined ? undefined : compile(options.slide, 'slide'),
      shapes:        options.shapes,
      align:         options.align,
      header:        compile(options.header, 'selector'),
      until:         options.until === undefined ? undefined : compile(options.until, 'until'),
      columns:       options.columns === undefined ? undefined : Object.fromEntries(Object.entries(options.columns).map(([key, pattern]) => [key, compile(pattern, `columns.${key}`)])),
      headerRows:    options.headerRows,
      fillDown:      options.fillDown,
      includeHidden: options.includeHidden,
    }
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : String(error) }
  }
  const tables = findDeckTables(document, query)

  return { matches: tables.map(table => ({ slide: table.slide, slideTitle: table.slideTitle, title: table.title, header: table.header, rows: table.rows })) }
}
