import type { PreviewRecord } from './records-table.component'
import { fieldsOf } from './records-table.component'

/** The formats the Records panel's export select offers (issue #116). */
export type RecordsExportFormat = 'json' | 'jsonl' | 'csv'

export interface RecordsExportFile {
  filename: string
  mimeType: string
  content:  string
}

const MIME_TYPES: Record<RecordsExportFormat, string> = {
  json:  'application/json',
  jsonl: 'application/x-ndjson',
  csv:   'text/csv',
}

/**
 * Builds the current sample's records as a downloadable file (issue #116):
 * reads straight from the `records` `run-session.store.ts` already holds —
 * no re-fetch. JSON is a pretty-printed array of each record's `data`
 * (`key`/`scope`/`mapping` are this panel's own trace bookkeeping, not part
 * of the record itself, so they are left out the same way the Table view's
 * columns already do). JSONL is the same data, one compact object per line —
 * exactly what `RecordsJsonl` renders. CSV flattens: one column per field
 * `fieldsOf` finds across every record (the Table view's own column set and
 * order), and a nested object or array is `JSON.stringify`d into its cell,
 * the same fallback `records-table.component.tsx`'s `Cell` already uses —
 * this is the simpler of the two sensible rules for a sample whose shape can
 * vary record to record (the other being a column per subfield, which would
 * make the header itself vary by which records happen to be present).
 */
export function buildRecordsExportFile (records: PreviewRecord[], format: RecordsExportFormat, baseName = 'records'): RecordsExportFile {
  return {
    filename: `${baseName}.${format}`,
    mimeType: MIME_TYPES[format],
    content:  contentOf(records, format),
  }
}

function contentOf (records: PreviewRecord[], format: RecordsExportFormat): string {
  if (format === 'json') return recordsToJson(records)
  if (format === 'jsonl') return recordsToJsonl(records)

  return recordsToCsv(records)
}

/** A pretty-printed JSON array of each record's `data` — the same shape `RecordsTable` renders as columns. */
export function recordsToJson (records: PreviewRecord[]): string {
  return JSON.stringify(records.map(record => record.data), null, 2)
}

/** One compact JSON object per line, the JSONL view's own content. */
export function recordsToJsonl (records: PreviewRecord[]): string {
  return records.map(record => JSON.stringify(record.data)).join('\n') + (records.length === 0 ? '' : '\n')
}

/**
 * A CSV with one column per `fieldsOf(records)`, CRLF line endings and RFC
 * 4180 quoting. CSV has no way to tell a missing field apart from an
 * explicit `null` — both render as a blank cell; JSON and JSONL are the
 * formats that keep the distinction.
 */
export function recordsToCsv (records: PreviewRecord[]): string {
  const fields = fieldsOf(records)
  const lines = [fields.map(field => csvCell(field)).join(',')]
  for (const record of records) lines.push(fields.map(field => csvCell(csvValue(record.data[field]))).join(','))

  return lines.join('\r\n') + (records.length === 0 ? '' : '\r\n')
}

/** A CSV cell's raw text before quoting: missing and `null` both render blank; an object or array is `JSON.stringify`d, same as the Table view's own cell. */
function csvValue (value: unknown): string {
  if (value === undefined || value === null) return ''

  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Quotes a CSV cell only when it needs it (comma, quote or newline), doubling any internal quote (RFC 4180). */
function csvCell (value: string): string {
  if (!/["\r\n,]/.test(value)) return value

  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll), same constraint content-pane/pdf-pick.mapper.ts's columnKeyFrom documents.
  return `"${value.replace(/"/g, '""')}"`
}
