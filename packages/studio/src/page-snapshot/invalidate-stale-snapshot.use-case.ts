import { readFile } from 'node:fs/promises'
import { startPointChanged } from './start-point.policy'
import { invalidateRecipe } from './snapshot.store'
import type { SnapshotCache } from './snapshot.store'

/**
 * Drops a recipe's cached snapshots when the edit about to be saved changes
 * its start point (issue #159). Call it before the file is written: it reads
 * the recipe as it is on disk now to compare.
 *
 * @param cache - The workspace's snapshot cache.
 * @param file - The recipe file being saved.
 * @param next - The recipe being saved.
 */
export async function invalidateStaleSnapshot (cache: SnapshotCache, file: string, next: unknown): Promise<void> {
  const id = (next as { id?: unknown } | null)?.id
  if (typeof id !== 'string') return
  if (startPointChanged(await savedRecipe(file), next)) invalidateRecipe(cache, id)
}

/** The recipe as saved on disk now, or `undefined` when there is no such file (or it is not JSON yet). */
async function savedRecipe (file: string): Promise<unknown> {
  try {
    const text = await readFile(file, 'utf8')

    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
