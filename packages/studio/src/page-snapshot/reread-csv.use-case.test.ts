import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { rereadCsv } from './reread-csv.use-case'

const listinoPath = join(__dirname, '..', '..', '..', 'core', 'src', 'workbook-document', 'fixtures', 'listino.csv')

describe('rereadCsv', () => {
  it('reads a CSV file: URL back into a workbook, auto-detecting whatever override is left out', async () => {
    const document = await rereadCsv(pathToFileURL(listinoPath).href, {})
    expect(document.kind).toBe('workbook')
    expect(document.csv).toEqual({ encoding: 'windows-1252', delimiter: ';' })
  })

  it('forces the delimiter and/or encoding given, instead of detecting them', async () => {
    const forced = await rereadCsv(pathToFileURL(listinoPath).href, { delimiter: ',', encoding: 'utf8' })
    expect(forced.csv?.delimiter).toBe(',')
    expect(forced.csv?.encoding).toMatch(/^utf-8$/)
    // A comma split of a `;`-delimited file gives one column per row.
    expect(forced.kind === 'workbook' && forced.sheets[0].rows[0]).toHaveLength(1)
  })

  it('throws a clear error when the URL does not exist', async () => {
    const missing = pathToFileURL(join(__dirname, 'no-such-file.csv')).href
    await expect(rereadCsv(missing, {})).rejects.toThrow()
  })
})
