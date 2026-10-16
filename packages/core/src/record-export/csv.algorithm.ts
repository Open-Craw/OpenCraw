import { cellText } from './table.mapper'
import type { ExportTable, TableCell } from './table.mapper'

/** A field needs quoting when it holds the separator, a quote or a line break (RFC 4180), or starts or ends with a space that a reader might trim. */
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/

function field (cell: TableCell): string {
  const text = cellText(cell)

  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/**
 * The table as CSV (RFC 4180): comma-separated, a header row of the field names, CRLF line ends, UTF-8.
 *
 * @param table - The table.
 * @returns The file's text.
 */
export function csvText (table: ExportTable): string {
  const lines = [table.columns.map(column => field(column.name)).join(','), ...table.rows.map(row => row.map(cell => field(cell)).join(','))]

  return `${lines.join('\r\n')}\r\n`
}
