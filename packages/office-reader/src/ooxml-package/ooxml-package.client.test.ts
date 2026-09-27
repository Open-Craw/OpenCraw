import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OoxmlPackage } from './ooxml-package.client'
import { relationshipOfType, relationshipsOf } from './relationships.mapper'
import { namespacedAttribute, walkXml } from './xml-walk.algorithm'

function fixture (...path: string[]): Uint8Array {
  return new Uint8Array(readFileSync(join(__dirname, ...path)))
}

const workbook = fixture('..', 'spreadsheet', 'fixtures', 'incentivi.xlsx')

describe('OoxmlPackage', () => {
  it('lists parts and inflates one at a time, whatever the separators and case of the stored names', () => {
    const pkg = OoxmlPackage.open(workbook)
    expect(pkg.names).toContain('xl/workbook.xml')
    expect(pkg.text('xl/workbook.xml')).toContain('<sheet name="Incentivi giugno"')
    expect(pkg.text('missing.xml')).toBe('')
    const backslashed = OoxmlPackage.open(fixture('..', 'spreadsheet', 'fixtures', 'date1904.xlsx'))
    expect(backslashed.names).toContain(String.raw`xl\workbook.xml`)
    expect(backslashed.text('/XL/Workbook.xml')).toContain('date1904')
  })

  it('refuses legacy, encrypted, OpenDocument and non-zip files, each with its code', () => {
    expect(() => OoxmlPackage.open(fixture('fixtures', 'legacy.xls'))).toThrow(expect.objectContaining({ code: 'legacy-format' }))
    expect(() => OoxmlPackage.open(fixture('fixtures', 'encrypted.xlsx'))).toThrow(expect.objectContaining({ code: 'encrypted' }))
    expect(() => OoxmlPackage.open(fixture('fixtures', 'sheet.ods'))).toThrow(expect.objectContaining({ code: 'unsupported-format' }))
    expect(() => OoxmlPackage.open(new TextEncoder().encode('a,b\n1,2\n'))).toThrow(expect.objectContaining({ code: 'not-zip' }))
  })

  it('refuses a part, or parts together, that declare more than the limits', () => {
    expect(() => OoxmlPackage.open(workbook, { entryBytes: 100 }).text('xl/worksheets/sheet1.xml')).toThrow(expect.objectContaining({ code: 'too-large' }))
    const pkg = OoxmlPackage.open(workbook, { totalBytes: 2000 })
    pkg.text('xl/worksheets/sheet1.xml')
    expect(() => pkg.text('xl/sharedStrings.xml')).toThrow(/together/)
  })

  it('counts a part read twice once against the total limit', () => {
    const size = OoxmlPackage.open(workbook).text('xl/worksheets/sheet1.xml').length
    const pkg = OoxmlPackage.open(workbook, { totalBytes: size + 10 })
    for (let read = 0; read < 5; read += 1) expect(pkg.text('xl/worksheets/sheet1.xml')).toHaveLength(size)
    expect(() => pkg.text('xl/sharedStrings.xml')).toThrow(/together/)
  })

  it('locates every part once, when it opens: reading a part never walks the zip\'s directory again', () => {
    const bytes = new Uint8Array(workbook)
    const pkg = OoxmlPackage.open(bytes)
    // Wipe the central directory: parts already located still read.
    const directory = bytes.findIndex((_byte, index) => bytes[index] === 0x50 && bytes[index + 1] === 0x4B && bytes[index + 2] === 0x01 && bytes[index + 3] === 0x02)
    bytes.fill(0, directory)
    expect(pkg.text('xl/workbook.xml')).toContain('<sheet name="Incentivi giugno"')
    expect(() => OoxmlPackage.open(bytes)).toThrow(expect.objectContaining({ code: 'not-zip' }))
  })

  it('never inflates past the size a header declares: a lying header gets a truncated part, not a megabyte', () => {
    expect(OoxmlPackage.open(fixture('fixtures', 'lying-size.xlsx')).text('xl/workbook.xml')).toHaveLength(16)
  })
})

describe('relationshipsOf', () => {
  it('resolves relative and absolute targets and types by their last segment', () => {
    const pkg = OoxmlPackage.open(workbook)
    expect(relationshipOfType(relationshipsOf(pkg, ''), 'officeDocument')?.target).toBe('xl/workbook.xml')
    const relationships = relationshipsOf(pkg, 'xl/workbook.xml')
    expect(relationships.get('rId1')).toEqual({ id: 'rId1', type: 'worksheet', target: 'xl/worksheets/sheet1.xml' })
    expect(relationships.get('rId4')?.target).toBe('xl/worksheets/sheet3.xml')
    expect(relationshipOfType(relationships, 'styles')?.target).toBe('xl/styles.xml')
  })
})

describe('walkXml', () => {
  it('drops element prefixes, keeps attribute ones, and never expands a declared entity', () => {
    const seen: string[] = []
    walkXml('<!DOCTYPE x [<!ENTITY lol "lol"><!ENTITY big "&lol;&lol;">]><x:root xmlns:x="u" ns1:id="7"><x:t>&big;|&amp;|&#233;</x:t></x:root>', {
      open: (name, attributes) => {
        seen.push(`<${name} ${namespacedAttribute(attributes, 'id') ?? ''}>`)
      },
      text: (text) => {
        seen.push(text)
      },
    })
    expect(seen.join('')).toContain('<root 7><t >&big;|&|é')
  })
})
