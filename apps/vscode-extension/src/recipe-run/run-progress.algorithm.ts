/** The longest a progress message is, so a notification does not grow wide. */
const MESSAGE_LIMIT = 90

/**
 * The last thing the run said, as a short line for the progress notification: the crawl's trace lines, one per event, tell what it is doing now.
 *
 * @param chunk - What the run wrote to its error output since the last call.
 * @returns The last non-empty line, shortened; `undefined` when the chunk has none.
 */
export function progressMessage (chunk: string): string | undefined {
  const lines = chunk.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  const last = lines.at(-1)
  if (last === undefined) return undefined

  return last.length > MESSAGE_LIMIT ? `${last.slice(0, MESSAGE_LIMIT - 1)}…` : last
}

/**
 * How many records a JSON Lines file holds.
 *
 * @param text - The file's content.
 * @returns The number of non-empty lines.
 */
export function recordCount (text: string): number {
  return text.split('\n').filter(line => line.trim() !== '').length
}
