import { cachedSnapshot, createSnapshotCache, invalidateRecipe, putSnapshot } from './snapshot.store'
import type { SnapshotResult } from './take-snapshot.use-case'

function snapshot (html: string): SnapshotResult {
  return { html, nodeCount: 1, baseUrl: 'https://example.com/', rawHtml: html }
}

describe('snapshot.store', () => {
  it('has nothing cached for a fresh cache', () => {
    const cache = createSnapshotCache()
    expect(cachedSnapshot(cache, 'products', 'start')).toBeUndefined()
  })

  it('caches per recipe and step path, so switching the selected step does not always refetch', () => {
    const cache = createSnapshotCache()
    putSnapshot(cache, 'products', 'start', snapshot('<p>start</p>'))
    putSnapshot(cache, 'products', 'steps.2', snapshot('<p>step 2</p>'))
    expect(cachedSnapshot(cache, 'products', 'start')?.html).toBe('<p>start</p>')
    expect(cachedSnapshot(cache, 'products', 'steps.2')?.html).toBe('<p>step 2</p>')
    expect(cachedSnapshot(cache, 'other-recipe', 'start')).toBeUndefined()
  })

  it('replaces the cached entry for the same recipe and step path', () => {
    const cache = createSnapshotCache()
    putSnapshot(cache, 'products', 'start', snapshot('<p>first</p>'))
    putSnapshot(cache, 'products', 'start', snapshot('<p>second</p>'))
    expect(cachedSnapshot(cache, 'products', 'start')?.html).toBe('<p>second</p>')
  })

  it('invalidateRecipe drops every cached path of that recipe, leaving other recipes alone', () => {
    const cache = createSnapshotCache()
    putSnapshot(cache, 'products', 'start', snapshot('<p>a</p>'))
    putSnapshot(cache, 'products', 'steps.1', snapshot('<p>b</p>'))
    putSnapshot(cache, 'other', 'start', snapshot('<p>c</p>'))
    invalidateRecipe(cache, 'products')
    expect(cachedSnapshot(cache, 'products', 'start')).toBeUndefined()
    expect(cachedSnapshot(cache, 'products', 'steps.1')).toBeUndefined()
    expect(cachedSnapshot(cache, 'other', 'start')?.html).toBe('<p>c</p>')
  })
})
