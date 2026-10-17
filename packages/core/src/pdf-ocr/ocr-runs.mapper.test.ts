import { ocrRuns } from './ocr-runs.mapper'
import type { OcrLine, OcrWord } from './ocr-engine.contract'

const word = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90): OcrWord => ({ text, x0, y0, x1, y1, confidence })

describe('ocrRuns', () => {
  it('turns words in pixels into runs in points, y growing upwards from the bottom of the page', () => {
    const lines: OcrLine[] = [{ words: [word('Price', 200, 100, 300, 140), word('list', 320, 100, 380, 140)] }]

    const runs = ocrRuns(lines, 2, 800)

    expect(runs.map(run => [run.x, run.y, run.width, run.text])).toEqual([[100, 730, 50, 'Price'], [160, 730, 30, 'list']])
    expect(runs[0].height).toBeCloseTo(26.67, 1)
  })

  it('puts every word of a line on the line\'s baseline, whatever hangs below it (a g, a y)', () => {
    // "Typing" has two tails: its box ends 12 px below the baseline the other words end on.
    const lines: OcrLine[] = [{ words: [word('Fast', 0, 100, 80, 140), word('Typing', 100, 100, 220, 152), word('works', 240, 100, 340, 140)] }]

    const ys = ocrRuns(lines, 1, 500).map(run => run.y)

    expect(new Set(ys).size).toBe(1)
    expect(ys[0]).toBe(500 - 140)
  })

  it('follows the slanted baseline of a line that was scanned crooked', () => {
    const baseline = { x0: 0, y0: 200, x1: 400, y1: 220 }
    const lines: OcrLine[] = [{ baseline, words: [word('left', 0, 170, 50, 200), word('right', 350, 190, 400, 220)] }]

    const [left, right] = ocrRuns(lines, 1, 1000)

    // The baseline is at 201.25 under the middle of "left" and at 218.75 under the middle of "right".
    expect(left.y).toBeCloseTo(1000 - 201.25, 5)
    expect(right.y).toBeCloseTo(1000 - 218.75, 5)
    expect(right.y).toBeLessThan(left.y)
  })

  it('leaves out words the engine is not sure of, and empty ones, and gives nothing for a line with none left', () => {
    const lines: OcrLine[] = [
      { words: [word('real', 0, 0, 40, 20, 88), word('speck', 50, 0, 90, 20, 8), word(' '.repeat(3), 100, 0, 120, 20, 90)] },
      { words: [word('smudge', 0, 40, 60, 60, 3)] },
    ]

    expect(ocrRuns(lines, 1, 100).map(run => run.text)).toEqual(['real'])
  })

  it('trims the text of a word, and handles no lines', () => {
    expect(ocrRuns([{ words: [word(' 15.950 ', 0, 0, 80, 20)] }], 1, 100)[0].text).toBe('15.950')
    expect(ocrRuns([], 1, 100)).toEqual([])
  })
})
