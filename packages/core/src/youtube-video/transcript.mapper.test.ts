import { transcriptSegments } from './transcript.mapper'

describe('transcriptSegments', () => {
  it('reads each event with words as a line with its start and duration in seconds', () => {
    const json = { events: [{ tStartMs: 1500, dDurationMs: 2500, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] }] }

    expect(transcriptSegments(json)).toEqual([{ start: 1.5, duration: 2.5, text: 'Hello world' }])
  })

  it('turns line breaks and runs of spaces into single spaces, and drops the events without words', () => {
    const json = {
      events: [
        { id: 1, wpWinPosId: 1 },
        { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: 'first line\nsecond   line' }] },
        { tStartMs: 3000, dDurationMs: 1000, aAppend: 1, segs: [{ utf8: '\n' }] },
        { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: ' '.repeat(3) }] },
        { tStartMs: 5000, segs: [{ utf8: 'no duration' }] },
      ],
    }

    expect(transcriptSegments(json)).toEqual([
      { start: 0, duration: 4, text: 'first line second line' },
      { start: 5, duration: 0, text: 'no duration' },
    ])
  })

  it('reads the words of an automatic caption, which come one by one with their own offsets', () => {
    const json = { events: [{ tStartMs: 160, dDurationMs: 5000, segs: [{ utf8: 'so', acAsrConf: 0 }, { utf8: ' here', tOffsetMs: 400, acAsrConf: 0 }, { utf8: ' we', tOffsetMs: 800, acAsrConf: 0 }] }] }

    expect(transcriptSegments(json)).toEqual([{ start: 0.16, duration: 5, text: 'so here we' }])
  })

  it('gives no lines for what is not a transcript', () => {
    expect(transcriptSegments(undefined)).toEqual([])
    expect(transcriptSegments({})).toEqual([])
    expect(transcriptSegments({ events: 'no' })).toEqual([])
    expect(transcriptSegments(null)).toEqual([])
  })
})
