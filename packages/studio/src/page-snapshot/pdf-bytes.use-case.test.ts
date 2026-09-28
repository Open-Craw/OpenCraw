import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pdfBytes } from './pdf-bytes.use-case'

const fixture = join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')

describe('pdfBytes', () => {
  it('reads a file: URL\'s bytes straight off disk, identical to the file on disk', async () => {
    const bytes = await pdfBytes(pathToFileURL(fixture).href)
    expect(Buffer.from(bytes)).toEqual(readFileSync(fixture))
  })

  it('throws a clear error when a file: URL does not exist', async () => {
    const missing = pathToFileURL(join(__dirname, 'no-such-file.pdf')).href
    await expect(pdfBytes(missing)).rejects.toThrow()
  })
})
