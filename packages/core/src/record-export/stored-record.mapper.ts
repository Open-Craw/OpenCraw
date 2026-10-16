import type { OutputRecord } from '../output-mapping'

/**
 * A record as a JSON Lines file holds it (the data, with the sink's `_source` and, when appending, `_key`) turned back into the record a sink takes,
 * so a finished run's file can be written again in another format.
 *
 * @param stored - One line of a records file, parsed.
 * @returns The record; a line with no `_source` gets an empty one.
 */
export function outputRecordOf (stored: Readonly<Record<string, unknown>>): OutputRecord {
  const { _source: source, _key: key, ...data } = stored
  const origin = typeof source === 'object' && source !== null ? source as Partial<OutputRecord['source']> : {}

  return {
    data,
    key:    typeof key === 'string' ? key : null,
    source: {
      recipeId:  typeof origin.recipeId === 'string' ? origin.recipeId : '',
      url:       typeof origin.url === 'string' ? origin.url : '',
      emittedAt: typeof origin.emittedAt === 'string' ? origin.emittedAt : '',
      ...(typeof origin.item === 'string' && { item: origin.item }),
    },
  }
}
