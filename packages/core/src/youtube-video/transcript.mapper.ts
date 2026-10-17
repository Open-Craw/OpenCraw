import type { TranscriptSegment } from './youtube-video.contract'

type Json = Record<string, unknown>

function objectOf (value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : undefined
}

/** Milliseconds as seconds, to the millisecond. */
function seconds (milliseconds: unknown): number {
  const value = Number(milliseconds)

  return Number.isFinite(value) ? Math.round(value) / 1000 : 0
}

/**
 * The lines of a transcript from the `json3` form YouTube serves captions in: each event with text is one line, its words joined, its line breaks
 * and runs of spaces made single spaces. Events that carry no words (styling, windows, the empty line an automatic caption appends) are left out.
 *
 * @param json - The parsed `json3` body.
 * @returns The lines in time order.
 */
export function transcriptSegments (json: unknown): TranscriptSegment[] {
  const events = objectOf(json)?.events
  if (!Array.isArray(events)) return []

  return events.flatMap((entry) => {
    const event = objectOf(entry)
    const parts = event?.segs
    if (event === undefined || !Array.isArray(parts)) return []
    const text = parts.map(part => String(objectOf(part)?.utf8 ?? '')).join('').replaceAll(/\s+/g, ' ').trim()

    return text === '' ? [] : [{ start: seconds(event.tStartMs), duration: seconds(event.dDurationMs), text }]
  })
}
