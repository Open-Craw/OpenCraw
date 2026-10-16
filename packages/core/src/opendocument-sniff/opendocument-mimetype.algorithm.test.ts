import { strToU8, zipSync } from 'fflate'
import { openDocumentFormat, openDocumentMimetype } from './opendocument-mimetype.algorithm'

function odf (mimetype: string): Uint8Array {
  return zipSync({ 'mimetype': [strToU8(mimetype), { level: 0 }], 'content.xml': strToU8('<x/>') })
}

describe('openDocumentMimetype', () => {
  it('reads the media type a stored first entry declares', () => {
    expect(openDocumentMimetype(odf('application/vnd.oasis.opendocument.spreadsheet'))).toBe('application/vnd.oasis.opendocument.spreadsheet')
    expect(openDocumentMimetype(odf('application/vnd.oasis.opendocument.text'))).toBe('application/vnd.oasis.opendocument.text')
  })

  it('says nothing about an Office Open XML package, another zip, or bytes that are not a zip', () => {
    const ooxml = zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'xl/workbook.xml': strToU8('<x/>') })
    const compressed = zipSync({ mimetype: strToU8('application/vnd.oasis.opendocument.spreadsheet'.repeat(5)) })

    expect(openDocumentMimetype(ooxml)).toBeUndefined()
    expect(openDocumentMimetype(compressed)).toBeUndefined()
    expect(openDocumentMimetype(odf('text/plain'))).toBeUndefined()
    expect(openDocumentMimetype(strToU8('a,b\n1,2\n'))).toBeUndefined()
    expect(openDocumentMimetype(new Uint8Array())).toBeUndefined()
  })
})

describe('openDocumentFormat', () => {
  it('maps a spreadsheet to a workbook, text to a document and a presentation to a deck', () => {
    expect(openDocumentFormat('application/vnd.oasis.opendocument.spreadsheet')).toBe('xlsx')
    expect(openDocumentFormat('application/vnd.oasis.opendocument.text; charset=binary')).toBe('docx')
    expect(openDocumentFormat('Application/Vnd.Oasis.OpenDocument.Presentation')).toBe('pptx')
    expect(openDocumentFormat('application/vnd.oasis.opendocument.graphics')).toBeUndefined()
    expect(openDocumentFormat('text/csv')).toBeUndefined()
  })
})
