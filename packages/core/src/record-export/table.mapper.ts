import type { OutputRecord } from '../output-mapping'
import type { OutputRecipe } from '../recipe-schema'

/** One column of an exported table: the output field it holds. */
export interface TableColumn {
  name:         string
  /** The field's type in the output recipe (`string`, `number`, `money`, `date`…), when the output declares it. */
  type?:        string
  description?: string
}

/** A cell as a spreadsheet or a page shows it: text, a number or a boolean; nothing is the empty text. */
export type TableCell = string | number | boolean

/** The records as rows under the output recipe's fields. */
export interface ExportTable {
  columns: TableColumn[]
  rows:    TableCell[][]
}

/**
 * Lays records out as a table: one column per output field, in the order the output recipe declares them (a value the records carry that the
 * output does not declare follows, so nothing is lost), one row per record.
 *
 * @param output - The output recipe the records were mapped to.
 * @param records - The records.
 * @returns The table.
 */
export function tableOf (output: OutputRecipe, records: readonly OutputRecord[]): ExportTable {
  const columns: TableColumn[] = Object.entries(output.fields).map(([name, field]) => ({ name, type: field.type, ...(field.description !== undefined && { description: field.description }) }))
  const declared = new Set(columns.map(column => column.name))
  const undeclared = undeclaredNames(records, declared)
  for (const name of undeclared) columns.push({ name })

  return { columns, rows: records.map(record => columns.map(column => cellOf(record.data[column.name]))) }
}

/** The names the records carry that the output does not declare, each once, in the order they first appear. */
function undeclaredNames (records: readonly OutputRecord[], declared: ReadonlySet<string>): string[] {
  const names = new Set<string>()
  for (const record of records) {
    for (const name of Object.keys(record.data)) {
      if (!declared.has(name)) names.add(name)
    }
  }

  return [...names]
}

/**
 * A value as one cell: numbers and booleans keep their type, text stays text, nothing (`null`, a missing value) is empty, and a list or an
 * object becomes its JSON, since a cell holds one value.
 *
 * @param value - The record's value.
 * @returns The cell.
 */
export function cellOf (value: unknown): TableCell {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()

  return JSON.stringify(value)
}

/** A cell as text, for the formats that only hold text (CSV, HTML, PDF). */
export function cellText (cell: TableCell): string {
  return typeof cell === 'string' ? cell : String(cell)
}
