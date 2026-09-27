import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { sniffFormat, zipPartNames } from './body-sniff.algorithm'

const officeFixture = (folder: string, name: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, '..', '..', '..', 'office-reader', 'src', folder, 'fixtures', name)))
const pdf = new Uint8Array(readFileSync(join(__dirname, '..', 'pdf-document', 'fixtures', 'discounts.pdf')))
const xlsx = officeFixture('spreadsheet', 'incentivi.xlsx')
const pptx = officeFixture('presentation', 'incentivi.pptx')
const docx = officeFixture('document', 'incentivi.docx')

describe('sniffFormat', () => {
  it('knows a PDF by %PDF-, even after a little junk', () => {
    expect(sniffFormat(pdf, '/download')).toBe('pdf')
    const padded = new Uint8Array([0x0A, 0x0A, ...pdf.subarray(0, 64)])
    expect(sniffFormat(padded, '/x')).toBe('pdf')
  })

  it('tells a workbook, a deck and a Word document apart by their part names', () => {
    expect(sniffFormat(xlsx, '/file')).toBe('xlsx')
    expect(sniffFormat(pptx, '/file')).toBe('pptx')
    expect(sniffFormat(docx, '/file')).toBe('docx')
    expect(zipPartNames(xlsx)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml']))
  })

  it('reads the local headers of a zip whose directory is cut off', () => {
    expect(sniffFormat(pptx.subarray(0, -30), '/file')).toBe('pptx')
  })

  it('leaves a zip that is not an Office package, plain text and nothing to the extension', () => {
    expect(sniffFormat(officeFixture('ooxml-package', 'sheet.ods'), '/sheet')).toBeUndefined()
    expect(sniffFormat(new TextEncoder().encode('Marca;Modello\nFiat;Pandina\n'), '/listino')).toBeUndefined()
    expect(sniffFormat(new Uint8Array(), '/empty')).toBeUndefined()
  })

  it('reads gzip as XML only under a .xml.gz name', () => {
    const gzipped = new Uint8Array(gzipSync('<urlset/>'))
    expect(sniffFormat(gzipped, '/sitemap.xml.gz')).toBe('xml')
    expect(sniffFormat(gzipped, '/archive.gz')).toBeUndefined()
  })
})
