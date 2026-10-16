import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    expect(imported.url).toBe('file:report.pdf')
    expect(new Uint8Array(readFileSync(imported.path))).toEqual(PDF_BYTES)
  })

  it('creates the folder when it does not exist yet, so a dropped file can start a workspace', async () => {
    const folder = join(freshFolder(), 'new', 'workspace')
    expect(existsSync(folder)).toBe(false)

    const imported = await importDocument(folder, 'report.pdf', PDF_BYTES)

    expect(existsSync(imported.path)).toBe(true)
  })

  it('reuses a file already there with the same bytes, so loading a document twice leaves one copy (#275)', async () => {
    const folder = freshFolder()
    const first = await importDocument(folder, 'report.pdf', PDF_BYTES)

    const again = await importDocument(folder, 'report.pdf', PDF_BYTES)

    expect(again).toEqual(first)
    expect(readdirSync(folder)).toEqual(['report.pdf'])
  })

  it('never overwrites a different file of the same name: the copy gets the next free numbered name', async () => {
    const folder = freshFolder()
    await importDocument(folder, 'report.pdf', PDF_BYTES)
    const second = await importDocument(folder, 'report.pdf', new TextEncoder().encode('second'))
    const third = await importDocument(folder, 'report.pdf', new TextEncoder().encode('third'))
    const secondAgain = await importDocument(folder, 'report.pdf', new TextEncoder().encode('second'))

    expect(second.path).toBe(join(folder, 'report-2.pdf'))
    expect(third.path).toBe(join(folder, 'report-3.pdf'))
    expect(secondAgain.path).toBe(second.path)
    expect(readFileSync(join(folder, 'report.pdf'), 'utf8')).toBe('%PDF-1.4 not really')
    expect(readFileSync(third.path, 'utf8')).toBe('third')
  })

  it('numbers a name with no extension too', async () => {
    const folder = freshFolder()
    await importDocument(folder, 'Makefile', PDF_BYTES)

    const second = await importDocument(folder, 'Makefile', new TextEncoder().encode('other'))
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
