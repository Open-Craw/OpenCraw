import type { SnapshotResult } from './take-snapshot.use-case'

/** A cache of the last snapshot taken per step path, so switching the selected step in the Steps outline does not always re-run the recipe (studio plan §3.1, issue #91). One per open recipe: key by `${recipeId}:${path}`. */
export interface SnapshotCache {
  entries: Map<string, SnapshotResult>
}

/** @returns An empty cache, for a freshly opened workspace. */
export function createSnapshotCache (): SnapshotCache {
  return { entries: new Map() }
}

/** @returns The cached snapshot for `recipeId`/`path`, or `undefined` when none was taken yet. */
export function cachedSnapshot (cache: SnapshotCache, recipeId: string, path: string): SnapshotResult | undefined {
  return cache.entries.get(keyOf(recipeId, path))
}

/** Records a freshly taken snapshot, replacing whatever was cached for the same recipe and step path. */
export function putSnapshot (cache: SnapshotCache, recipeId: string, path: string, snapshot: SnapshotResult): void {
  cache.entries.set(keyOf(recipeId, path), snapshot)
}

/** Drops every cached snapshot of one recipe — called after a save, since the steps up to any path may now capture something different. */
export function invalidateRecipe (cache: SnapshotCache, recipeId: string): void {
  const prefix = `${recipeId}:`
  for (const key of cache.entries.keys()) {
    if (key.startsWith(prefix)) cache.entries.delete(key)
  }
}

function keyOf (recipeId: string, path: string): string {
  return `${recipeId}:${path}`
}
