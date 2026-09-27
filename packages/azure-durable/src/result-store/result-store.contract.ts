import type { OutputRecord } from '@opencraw/core'

/** Where results too large to return inline go. */
export interface ResultStore {
  /**
   * Saves records as JSON Lines.
   *
   * @param name - A path-like name, unique per result: `<instance>/<recipe>.jsonl`.
   * @param records - The records.
   * @returns A URL the caller can read them from.
   */
  save (name: string, records: readonly OutputRecord[]): Promise<string>
}
