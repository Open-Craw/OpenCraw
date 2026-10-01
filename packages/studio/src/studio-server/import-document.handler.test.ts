import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { handleImportDocument } from './import-document.handler'

describe('handleImportDocument', () => {
  it('decodes the base64 bytes into a copy under the folder, and answers its path and file: URL', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-import-handler-'))

    const view = await handleImportDocument({ type: 'import-document', folder, name: 'report.pdf', bytes: Buffer.from('%PDF-1.4').toString('base64') })

    expect(view).toEqual({ path: join(folder, 'report.pdf'), url: pathToFileURL(join(folder, 'report.pdf')).href })
    expect(readFileSync(view.path, 'utf8')).toBe('%PDF-1.4')
  })
})
