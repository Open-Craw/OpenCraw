import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openPath } from './open-path.use-case'

function fresh (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-open-path-'))
}

const INPUT = { kind: 'input', id: 'books', output: 'book', mode: 'api', start: [{ url: 'file:///x.json' }], steps: [], mapping: {} }
const OUTPUT = { kind: 'output', id: 'book', version: 1, fields: { name: { type: 'string', required: true, key: true } } }

describe('openPath', () => {
  it('opens a folder as the workspace', async () => {
    const folder = fresh()

    expect(await openPath(folder)).toEqual({ kind: 'folder', folder })
  })

  it('opens an input recipe through its folder, selecting it', async () => {
    const folder = fresh()
    writeFileSync(join(folder, 'books.input.json'), JSON.stringify(INPUT))

    expect(await openPath(join(folder, 'books.input.json'))).toEqual({ kind: 'recipe', folder, recipeId: 'books' })
  })

  it('opens an output recipe by selecting the first input that names it', async () => {
    const folder = fresh()
    writeFileSync(join(folder, 'book.output.json'), JSON.stringify(OUTPUT))
    writeFileSync(join(folder, 'books.input.json'), JSON.stringify(INPUT))

    expect(await openPath(join(folder, 'book.output.json'))).toEqual({ kind: 'recipe', folder, recipeId: 'books' })
  })

  it('opens an output recipe nobody uses with nothing to select', async () => {
    const folder = fresh()
    writeFileSync(join(folder, 'book.output.json'), JSON.stringify(OUTPUT))

    expect(await openPath(join(folder, 'book.output.json'))).toEqual({ kind: 'recipe', folder, recipeId: undefined })
  })

  it('reads a document in place when it is already inside the workspace', async () => {
    const folder = fresh()
    mkdirSync(join(folder, 'docs'))
    const file = join(folder, 'docs', 'report.csv')
    writeFileSync(file, 'a,b\n')

    expect(await openPath(file, folder)).toEqual({ kind: 'document', folder, path: file, url: pathToFileURL(file).href })
  })

  it('uses the folder of the document itself when no workspace is given', async () => {
    const folder = fresh()
    const file = join(folder, 'report.csv')
    writeFileSync(file, 'a,b\n')

    expect(await openPath(file)).toEqual({ kind: 'document', folder, path: file, url: pathToFileURL(file).href })
  })

  it('copies a document from outside the workspace into it', async () => {
    const workspace = fresh()
    const elsewhere = fresh()
    const file = join(elsewhere, 'report.csv')
    writeFileSync(file, 'a,b\n')

    const view = await openPath(file, workspace)

    expect(view).toMatchObject({ kind: 'document', folder: workspace, path: join(workspace, 'report.csv') })
    expect(readFileSync(join(workspace, 'report.csv'), 'utf8')).toBe('a,b\n')
  })

  it('treats a JSON file that is not a recipe as a document', async () => {
    const folder = fresh()
    const file = join(folder, 'data.json')
    writeFileSync(file, JSON.stringify({ items: [] }))

    expect(await openPath(file)).toMatchObject({ kind: 'document', path: file })
  })

  it('refuses a relative path and a missing one', async () => {
    await expect(openPath('recipes')).rejects.toThrow('not an absolute path')
    const missing = join(fresh(), 'nope.pdf')
    await expect(openPath(missing)).rejects.toThrow('does not exist')
  })
})
