import { OoxmlPackage } from '../ooxml-package'
import type { PackageLimits } from '../ooxml-package'
import { readSource } from '../source-bytes'
import type { OfficeSource } from '../source-bytes'
import type { CellValue, SheetFilter, ValueMode, Workbook } from '../spreadsheet'
import { odsSheets } from './ods-sheets.mapper'

/** How to read an OpenDocument spreadsheet; the same choices as `readXlsx`. */
export interface ReadOdsOptions {
  /** Which sheets to read; default all. */
  sheets?: SheetFilter
  /** `typed` (default): numbers, booleans, dates as values; `text`: every cell as canonical text. */
  values?: ValueMode
  /** How much the file may inflate to. */
  limits?: PackageLimits
}

/** The media type an OpenDocument spreadsheet declares in its `mimetype` entry. */
const ODS_MIMETYPE = 'application/vnd.oasis.opendocument.spreadsheet'

/**
 * Reads an OpenDocument spreadsheet (`.ods`, as LibreOffice, Google Sheets and Excel save it) into the same {@link Workbook} model `readXlsx`
 * gives: every sheet's cells, with the merged ranges and hidden rows and sheets a person would see. Formulas give the value stored with
 * them; nothing is evaluated. Display formats are not applied.
 *
 * @param source - A path, bytes, a Blob or a stream (see {@link OfficeSource}).
 * @param options - Which sheets, which value mode, which limits.
 * @returns The workbook.
 * @throws OfficeReadError for a file that is not a readable spreadsheet: `not-zip`, `legacy-format`, `unsupported-format` (another kind of file), `too-large`…
 */
export async function readOds (source: OfficeSource, options: ReadOdsOptions & { values: 'text' }): Promise<Workbook<string>>
export async function readOds (source: OfficeSource, options?: ReadOdsOptions): Promise<Workbook>
export async function readOds (source: OfficeSource, options: ReadOdsOptions = {}): Promise<Workbook<CellValue>> {
  const pkg = OoxmlPackage.openOpenDocument(await readSource(source), ODS_MIMETYPE, options.limits)

  return { date1904: false, sheets: odsSheets(pkg.text('content.xml'), options.values ?? 'typed', options.sheets) }
}
