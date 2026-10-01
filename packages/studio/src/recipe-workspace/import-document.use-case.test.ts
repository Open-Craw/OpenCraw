import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { importDocument } from './import-document.use-case'

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 not really')

function freshFolder (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-import-document-'))
}

describe('importDocument', () => {
  it('writes the bytes under the folder with the given name, and answers the path and its file: URL', async () => {
    const folder = freshFolder()

    const imported = await importDocument(folder, 'report.pdf', PDF_BYTES)

    expect(imported.path).toBe(join(folder, 'report.pdf'))
    expect(imported.url).toBe(pathToFileURL(join(folder, 'report.pdf')).href)
    expect(new Uint8Array(readFileSync(imported.path))).toEqual(PDF_BYTES)
  })

  it('creates the folder when it does not exist yet, so a dropped file can start a workspace', async () => {
    const folder = join(freshFolder(), 'new', 'workspace')
    expect(existsSync(folder)).toBe(false)

    const imported = await importDocument(folder, 'report.pdf', PDF_BYTES)

    expect(existsSync(imported.path)).toBe(true)
  })

  it('never overwrites a file already there: the copy gets the next free numbered name', async () => {
    const folder = freshFolder()
    await importDocument(folder, 'report.pdf', PDF_BYTES)
    await importDocument(folder, 'report.pdf', PDF_BYTES)

    const third = await importDocument(folder, 'report.pdf', new TextEncoder().encode('third'))

    expect(third.path).toBe(join(folder, 'report-3.pdf'))
    expect(readFileSync(join(folder, 'report.pdf'), 'utf8')).toBe('%PDF-1.4 not really')
    expect(readFileSync(join(folder, 'report-2.pdf'), 'utf8')).toBe('%PDF-1.4 not really')
    expect(readFileSync(third.path, 'utf8')).toBe('third')
  })

  it('numbers a name with no extension too', async () => {
    const folder = freshFolder()
    await importDocument(folder, 'Makefile', PDF_BYTES)

    const second = await importDocument(folder, 'Makefile', PDF_BYTES)
    expect(second.path).toBe(join(folder, 'Makefile-2'))
  })

  it('refuses a name that is not a plain file name (a path, or a dot name), writing nothing', async () => {
    const folder = freshFolder()

    await expect(importDocument(folder, '../escape.pdf', PDF_BYTES)).rejects.toThrow('not a plain file name')
    await expect(importDocument(folder, 'sub/dir.pdf', PDF_BYTES)).rejects.toThrow('not a plain file name')
    await expect(importDocument(folder, '..', PDF_BYTES)).rejects.toThrow('not a plain file name')
    expect(existsSync(join(folder, '..', 'escape.pdf'))).toBe(false)
  })
})
