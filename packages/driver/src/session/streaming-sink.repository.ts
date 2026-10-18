import type { RecordSink } from '@opencraw/core'

/**
 * The sink of a run with no `out` file: it keeps nothing, since each record already reached the client
 * as a `record` notification from its `record:emit` event, and only counts them for the report. A long
 * crawl therefore streams in constant memory.
 */
export function streamingSink (): RecordSink {
  let written = 0

  return {
    open:  async () => {},
    write: async () => { written += 1 },
    close: async () => ({ written }),
  }
}
