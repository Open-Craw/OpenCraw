import { unsupportedFormatMessage } from './unsupported-format.policy'

describe('unsupportedFormatMessage', () => {
  it('says what an OpenDocument presentation is and what to do instead', () => {
    expect(unsupportedFormatMessage('Talk.odp')).toBe('“Talk.odp” is an OpenDocument presentation, which the Studio cannot read yet. Open it in PowerPoint or LibreOffice, save it as .pptx or .pdf, and load that file.')
  })

  it('does not refuse an OpenDocument spreadsheet or text document: the Studio reads them', () => {
    expect(unsupportedFormatMessage('LiveTable254.ods')).toBeUndefined()
    expect(unsupportedFormatMessage('Report.odt')).toBeUndefined()
  })

  it('reads the type off an address, ignoring its query and the case', () => {
    expect(unsupportedFormatMessage('https://example.org/files/Talk.ODP?download=1')).toMatch(/OpenDocument presentation/)
    expect(unsupportedFormatMessage(String.raw`C:\Users\me\Pictures\scan.PNG`)).toMatch(/“scan.PNG” is a picture/)
  })

  it('leaves the types the Studio reads, and the ones it does not know, alone', () => {
    for (const name of ['a.pdf', 'a.xlsx', 'a.csv', 'a.json', 'a.md', 'a.docx', 'a.pptx', 'a.xls', 'a', 'a.unknown']) expect(unsupportedFormatMessage(name)).toBeUndefined()
  })
})
