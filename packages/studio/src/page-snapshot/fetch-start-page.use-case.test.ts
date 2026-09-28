import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InputRecipe } from '@opencraw/core'
import { fetchStartPage } from './fetch-start-page.use-case'

function apiRecipe (url: string): InputRecipe {
  return { kind: 'input', id: 'sample', output: 'thing', mode: 'api', start: [{ url }], steps: [], mapping: {} } as unknown as InputRecipe
}

describe('fetchStartPage', () => {
  it('api mode: returns a JSON response pretty-printed as text', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-snapshot-'))
    const file = join(folder, 'data.json')
    writeFileSync(file, JSON.stringify({ hello: 'world' }))
    const text = await fetchStartPage(apiRecipe(`file://${file}`))
    expect(JSON.parse(text)).toEqual({ hello: 'world' })
  })

  it('api mode: returns an HTML response as its raw markup', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-snapshot-'))
    const file = join(folder, 'page.html')
    writeFileSync(file, '<!doctype html><html><body><h1>hi</h1></body></html>')
    const text = await fetchStartPage(apiRecipe(`file://${file}`))
    expect(text).toContain('<h1>hi</h1>')
  })

  it('rejects a recipe with no start point', async () => {
    const recipe = { ...apiRecipe('file:///x.json'), start: [] }
    await expect(fetchStartPage(recipe)).rejects.toThrow('has no start point')
  })
})
