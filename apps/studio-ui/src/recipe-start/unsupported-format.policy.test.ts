import { unsupportedFormatMessage } from './unsupported-format.policy'

describe('unsupportedFormatMessage', () => {
  it('says what an OpenDocument spreadsheet is and what to do instead', () => {
    expect(unsupportedFormatMessage('LiveTable254.ods')).toBe('“LiveTable254.ods” is an OpenDocument spreadsheet, which the Studio cannot read yet. Open it in Excel or LibreOffice, save it as .xlsx or .csv, and load that file.')
  })

  it('reads the type off an address, ignoring its query and the case', () => {
    expect(unsupportedFormatMessage('https://example.org/files/Report.ODT?download=1')).toMatch(/OpenDocument text document/)
    expect(unsupportedFormatMessage(String.raw`C:\Users\me\Pictures\scan.PNG`)).toMatch(/“scan.PNG” is a picture/)
  })

  it('leaves the types the Studio reads, and the ones it does not know, alone', () => {
    for (const name of ['a.pdf', 'a.xlsx', 'a.csv', 'a.json', 'a.md', 'a.docx', 'a.pptx', 'a.xls', 'a', 'a.unknown']) expect(unsupportedFormatMessage(name)).toBeUndefined()
  })
})
