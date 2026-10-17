import { unsupportedFormatMessage } from './unsupported-format.policy'

describe('unsupportedFormatMessage', () => {
  it('does not refuse an OpenDocument spreadsheet, text document or presentation: the Studio reads them', () => {
    expect(unsupportedFormatMessage('LiveTable254.ods')).toBeUndefined()
    expect(unsupportedFormatMessage('Report.odt')).toBeUndefined()
    expect(unsupportedFormatMessage('Talk.odp')).toBeUndefined()
  })

  it('reads the type off an address, ignoring its query and the case', () => {
    expect(unsupportedFormatMessage('https://example.org/files/Slides.KEY?download=1')).toMatch(/Keynote/)
    expect(unsupportedFormatMessage(String.raw`C:\Users\me\Pictures\scan.PNG`)).toMatch(/“scan.PNG” is a picture/)
  })

  it('leaves the types the Studio reads, and the ones it does not know, alone', () => {
    for (const name of ['a.pdf', 'a.xlsx', 'a.csv', 'a.json', 'a.md', 'a.docx', 'a.pptx', 'a.xls', 'a', 'a.unknown']) expect(unsupportedFormatMessage(name)).toBeUndefined()
  })
})
