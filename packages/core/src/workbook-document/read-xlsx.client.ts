import type { WorkbookCell, WorkbookDocument } from './workbook-document.model'

/**
 * Reads an `.xlsx` workbook into a workbook document, through
 * `@opencraw/office-reader`: every worksheet's cells, with hidden sheets,
 * hidden rows and merged ranges. Numbers and booleans keep their type (a
 * cell's `13955.625` is unambiguous; as text, a locale guess could read it as
 * thirteen million), dates become ISO text, errors their text, empty cells
 * `''`. Formulas give their cached value. The reader is imported on first use,
 * so recipes that never read a spreadsheet never load it.
 *
 * @param bytes - The file.
 * @param source - Where it came from, for messages.
 * @returns The workbook.
 * @throws Error naming the source, and saying what to do, for a file that is
 * not a readable workbook (a legacy `.xls`, a password-protected file, an `.ods`…).
 */
export async function readXlsxWorkbook (bytes: Uint8Array, source: string): Promise<WorkbookDocument> {
  const { readXlsx, OfficeReadError } = await import('@opencraw/office-reader/xlsx')
  try {
    const book = await readXlsx(bytes)

    return {
      kind:   'workbook',
      sheets: book.sheets.map(sheet => ({ name: sheet.name, rows: sheet.rows.map(row => row.map(cell => workbookCell(cell, book.date1904))), hidden: sheet.hidden, hiddenRows: sheet.hiddenRows, merges: sheet.merges })),
    }
  } catch (error) {
    if (error instanceof OfficeReadError) throw new Error(`${source}: ${error.message}`, { cause: error })
    throw error
  }
}

const MS_PER_DAY = 86_400_000
/** Day zero of each date system, where a time of day falls: serial 0 is 1899-12-30 in the 1900 system, 1904-01-01 in the 1904 one. */
const DAY_ZERO = { 1900: Date.UTC(1899, 11, 30), 1904: Date.UTC(1904, 0, 1) }

/** A typed spreadsheet value as a workbook cell. */
function workbookCell (value: string | number | boolean | Date | null | { error: string }, date1904: boolean): WorkbookCell {
  if (value === null) return ''
  if (value instanceof Date) return isoText(value, date1904)
  if (typeof value === 'object') return value.error

  return value
}

/**
 * A date as ISO text: the day alone at midnight, the time alone for a time of
 * day (a serial under 1: a moment on its date system's day zero), both
 * otherwise.
 */
function isoText (date: Date, date1904: boolean): string {
  const iso = date.toISOString()
  const serial = (date.getTime() - DAY_ZERO[date1904 ? 1904 : 1900]) / MS_PER_DAY
  if (serial >= 0 && serial < 1) return iso.slice(11, 19)

  return iso.slice(11, 19) === '00:00:00' ? iso.slice(0, 10) : iso.slice(0, 19)
}
