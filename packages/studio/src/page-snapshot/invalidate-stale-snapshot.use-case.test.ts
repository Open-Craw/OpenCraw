import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { invalidateStaleSnapshot } from './invalidate-stale-snapshot.use-case'
import { cachedSnapshot, createSnapshotCache, putSnapshot } from './snapshot.store'

const snap = { html: '<p>x</p>', nodeCount: 1, baseUrl: 'https://a.test/', rawHtml: '<p>x</p>' }
const recipe = { kind: 'input', id: 'r', output: 'o', mode: 'web', start: [{ url: 'https://a.test/' }], steps: [], mapping: {} }

function savedFile (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-snap-'))
  const file = join(folder, 'r.input.json')
  writeFileSync(file, JSON.stringify(recipe))

  return file
}

describe('invalidateStaleSnapshot', () => {
  it('keeps the snapshot across an edit that only adds steps', async () => {
    const cache = createSnapshotCache()
    putSnapshot(cache, 'r', 'start', snap)
    await invalidateStaleSnapshot(cache, savedFile(), { ...recipe, steps: [{ type: 'goto', url: '{{start.url}}' }] })
    expect(cachedSnapshot(cache, 'r', 'start')).toBeDefined()
  })

  it('drops it when the mode or start changes', async () => {
    const cache = createSnapshotCache()
    putSnapshot(cache, 'r', 'start', snap)
    await invalidateStaleSnapshot(cache, savedFile(), { ...recipe, mode: 'api', start: [{ url: 'https://a.test/api' }] })
    expect(cachedSnapshot(cache, 'r', 'start')).toBeUndefined()
  })

  it('drops it for a recipe file that did not exist yet, and ignores a value without an id', async () => {
    const cache = createSnapshotCache()
    putSnapshot(cache, 'r', 'start', snap)
    await invalidateStaleSnapshot(cache, join(tmpdir(), 'opencraw-missing-r.input.json'), recipe)
    expect(cachedSnapshot(cache, 'r', 'start')).toBeUndefined()
    putSnapshot(cache, 'r', 'start', snap)
    await invalidateStaleSnapshot(cache, savedFile(), { nope: true })
    expect(cachedSnapshot(cache, 'r', 'start')).toBeDefined()
  })
})
