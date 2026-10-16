import { strToU8, zipSync } from 'fflate'
import type { ExportTable, TableCell } from './table.mapper'

/** Excel's own limits: a sheet name is at most 31 characters and holds none of `: \ / ? * [ ]`. */
const SHEET_NAME_LIMIT = 31
const WIDEST_COLUMN = 60

/** Whether XML 1.0 can hold a character at all: control characters other than tab and the line breaks cannot be. */
function isXmlCharacter (character: string): boolean {
  const code = character.codePointAt(0) ?? 0

  return code >= 32 || code === 9 || code === 10 || code === 13
}

function escapeXml (text: string): string {
  return [...text].filter(character => isXmlCharacter(character)).join('').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** `A`, `B`… `Z`, `AA`… for a 0-based column. */
function columnLetters (index: number): string {
  let letters = ''
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCodePoint(65 + ((rest - 1) % 26)) + letters

  return letters
}

function sheetNameOf (title: string): string {
  const cleaned = title.replaceAll(/[:\\/?*[\]]/g, ' ').trim().slice(0, SHEET_NAME_LIMIT)

  return cleaned === '' ? 'Records' : cleaned
}

function cellXml (cell: TableCell, reference: string, style?: number): string {
  const s = style === undefined ? '' : ` s="${String(style)}"`
  if (typeof cell === 'number') return `<c r="${reference}"${s}><v>${String(cell)}</v></c>`
  if (typeof cell === 'boolean') return `<c r="${reference}"${s} t="b"><v>${cell ? '1' : '0'}</v></c>`
  if (cell === '') return `<c r="${reference}"${s}/>`

  return `<c r="${reference}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`
}

/** A column's width in characters: its longest text, with a little room, between a minimum and a maximum. */
function widthOf (table: ExportTable, column: number): number {
  const longest = Math.max(table.columns[column].name.length, ...table.rows.slice(0, 500).map(row => String(row[column]).length))

  return Math.min(WIDEST_COLUMN, Math.max(8, longest + 2))
}

function sheetXml (table: ExportTable): string {
  const last = `${columnLetters(Math.max(0, table.columns.length - 1))}${String(table.rows.length + 1)}`
  const header = table.columns.map((column, index) => cellXml(column.name, `${columnLetters(index)}1`, 1)).join('')
  const body = table.rows.map((row, rowIndex) => `<row r="${String(rowIndex + 2)}">${row.map((cell, index) => cellXml(cell, `${columnLetters(index)}${String(rowIndex + 2)}`)).join('')}</row>`).join('')
  const widths = table.columns.map((_column, index) => `<col min="${String(index + 1)}" max="${String(index + 1)}" width="${String(widthOf(table, index))}" customWidth="1"/>`).join('')

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${last}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths}</cols>` +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    `<autoFilter ref="A1:${last}"/>` +
    '</worksheet>'
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6F2FDA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
  '</styleSheet>'

/**
 * The table as an Excel workbook (.xlsx): one sheet named after the output, a header row in the OpenCraw violet with the filter on and frozen, numbers and
 * booleans kept as numbers and booleans, columns sized to their content. Written with no library beyond a zip: the package is made by hand.
 *
 * @param table - The table.
 * @param title - The output recipe's id, used as the sheet's name.
 * @returns The file's bytes.
 */
export function xlsxBytes (table: ExportTable, title: string): Uint8Array {
  const sheet = escapeXml(sheetNameOf(title))
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml':        strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels':                strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="https://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml':            strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="https://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="https://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml':              strToU8(STYLES),
    'xl/worksheets/sheet1.xml':   strToU8(sheetXml(table)),
  }

  return zipSync(files)
}
