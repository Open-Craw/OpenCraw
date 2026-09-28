import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InputRecipe } from '@opencraw/core'
import { takeSnapshot } from './take-snapshot.use-case'

function apiRecipe (url: string): InputRecipe {
  return { kind: 'input', id: 'sample', output: 'thing', mode: 'api', start: [{ url }], steps: [], mapping: {} } as unknown as InputRecipe
}

describe('takeSnapshot (api mode: web mode needs a real browser, exercised by packages/studio/e2e/picking.e2e.test.ts)', () => {
  it('rewrites the fetched HTML: absolute urls, a base, node ids', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-snapshot-'))
    const file = join(folder, 'page.html')
    writeFileSync(file, '<!doctype html><html><body><a href="/next">go</a><p class="price">£10</p></body></html>')
    const snapshot = await takeSnapshot(apiRecipe(`file://${file}`), 'start')
    expect(snapshot.html).toContain('data-oc-node="n0"')
    expect(snapshot.html).toContain('href="file:///next"') // new URL('/next', baseUrl) resolves against the file: URL's root, not its directory — real URL semantics, not a bug
    expect(snapshot.nodeCount).toBeGreaterThan(0)
    expect(snapshot.baseUrl).toBe(`file://${file}`)
  })

  it('rejects a recipe with no start point', async () => {
    const recipe = { ...apiRecipe('file:///x.html'), start: [] }
    await expect(takeSnapshot(recipe, 'start')).rejects.toThrow('has no start point')
  })

  it('rejects a step path other than "start" (mid-recipe snapshots are not wired up yet)', async () => {
    await expect(takeSnapshot(apiRecipe('file:///x.html'), 'steps.2')).rejects.toThrow('is not supported yet')
  })
})
