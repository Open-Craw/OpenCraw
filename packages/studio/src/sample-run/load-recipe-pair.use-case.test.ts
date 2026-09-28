import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRecipePair } from './load-recipe-pair.use-case'

function folderOf (files: Record<string, unknown>): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-pair-'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), JSON.stringify(content))

  return folder
}

const INPUT = { kind: 'input', id: 'books', output: 'book', mode: 'api', start: [{ url: 'file:///a.json' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' }, { type: 'emit' }], mapping: { title: { from: 'doc.title' } } }
const OUTPUT = { kind: 'output', id: 'book', version: 1, fields: { title: { type: 'string', required: true, key: true } } }

describe('loadRecipePair', () => {
  it('finds and parses the named input and its output', async () => {
    const folder = folderOf({ 'book.output.json': OUTPUT, 'books.input.json': INPUT })
    const pair = await loadRecipePair(folder, 'books')
    expect(pair.input.id).toBe('books')
    expect(pair.output.id).toBe('book')
  })

  it('rejects an unknown recipe id', async () => {
    const folder = folderOf({ 'book.output.json': OUTPUT, 'books.input.json': INPUT })
    await expect(loadRecipePair(folder, 'nope')).rejects.toThrow('no input recipe "nope"')
  })

  it('rejects an input whose output is missing from the workspace', async () => {
    const folder = folderOf({ 'books.input.json': INPUT })
    await expect(loadRecipePair(folder, 'books')).rejects.toThrow('no output recipe "book"')
  })
})
