import type { SampleRunResult } from './sample-run-record.contract'

/** The last completed sample run of one input recipe: its records, rejections, mapping traces and step summary, kept for `explain-why` (issue #92) so a Why? click needs no second run. */
export interface LastRunEntry {
  recipeId: string
  result:   SampleRunResult
}

/** One server's worth of last-run entries, by recipe id: a run replaces the previous one for the same recipe. */
export interface LastRunCache {
  entries: Map<string, LastRunEntry>
}

/** @returns A fresh, empty cache. */
export function createLastRunCache (): LastRunCache {
  return { entries: new Map() }
}

/** Records a finished sample run, replacing whatever this recipe's cache entry held before. */
export function recordLastRun (cache: LastRunCache, recipeId: string, result: SampleRunResult): void {
  cache.entries.set(recipeId, { recipeId, result })
}

/** @returns The recipe's last completed sample run, or `undefined` when none has finished yet. */
export function lastRunOf (cache: LastRunCache, recipeId: string): LastRunEntry | undefined {
  return cache.entries.get(recipeId)
}
