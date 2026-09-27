import type { OutputRecord } from '@opencraw/core'
import type { ResultStore } from './result-store.contract'

/** Records returned in the Durable output, or where to read them when they were too large. */
export interface PackedRecords {
  records?:   OutputRecord[]
  resultUrl?: string
}

/**
 * Returns records inline when small, else saves them and returns a link: an
 * orchestration's history holds every activity output, so a large result
 * belongs in storage, not in the task hub.
 *
 * @param records - The records.
 * @param options - The store (without one, records are always inline), the limit, the name to save under.
 * @returns The records or their link.
 */
export async function packRecords (records: readonly OutputRecord[], options: { store?: ResultStore, inlineLimitBytes: number, name: string }): Promise<PackedRecords> {
  if (options.store === undefined || Buffer.byteLength(JSON.stringify(records)) <= options.inlineLimitBytes) return { records: [...records] }

  return { resultUrl: await options.store.save(options.name, records) }
}
