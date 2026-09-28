import { analyzeTables } from '@opencraw/core'
import type { PdfDocument, PdfTable, TableAlign, TableBandDiagnostics } from '@opencraw/core'

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
 * The PDF-facing version of the "preview a table extract" need issue #94's
 * 5c (the workbook grid) will also want; nothing about its shape is
 * PDF-specific, only which `@opencraw/core` reader it calls — a `previewGridTable`
 * alongside this one, sharing `TablePreviewMatch`/`TablePreviewResult`, is
 * the natural way to extend it when 5c is built.
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
