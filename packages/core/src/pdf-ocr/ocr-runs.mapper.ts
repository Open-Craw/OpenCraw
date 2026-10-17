import type { PositionedText } from '../pdf-document'
import type { OcrLine, OcrWord } from './ocr-engine.contract'

/** Below this confidence (0 to 100) a word is the engine guessing at a speck or a stain, not reading: it is left out. */
const MIN_CONFIDENCE = 20
/** The share of an em a word's box rises above the baseline: capitals and ascenders reach about this far. */
const ASCENDER_SHARE = 0.75

function median (values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0)
}

/** Where the baseline is under a word, in pixels: on the line the engine measured, else where most of the line's words end (a word with a tail, g or y, ends lower). */
function baselineAt (line: OcrLine, word: OcrWord, fallback: number): number {
  const { baseline } = line
  if (baseline === undefined) return fallback
  const run = baseline.x1 - baseline.x0
  if (run <= 0) return baseline.y0
  const centre = (word.x0 + word.x1) / 2
  const at = Math.min(1, Math.max(0, (centre - baseline.x0) / run))

  return baseline.y0 + ((baseline.y1 - baseline.y0) * at)
}

/**
 * The words of a page as the text runs a PDF's text layer gives (`PositionedText`: points, y growing upwards, the baseline), so rows, cells,
 * tables and regions are found on a scan exactly as they are on a PDF with text. A word on a crooked scan sits on its line's slanted baseline;
 * the font size is what the capitals and ascenders of the line imply.
 *
 * @param lines - What the engine read, in the page image's pixels.
 * @param scale - Pixels to each point of the page.
 * @param pageHeight - The page's height in points.
 * @returns One run per word the engine is sure enough of.
 */
export function ocrRuns (lines: readonly OcrLine[], scale: number, pageHeight: number): PositionedText[] {
  return lines.flatMap((line) => {
    const words = line.words.filter(word => word.text.trim() !== '' && word.confidence >= MIN_CONFIDENCE)
    if (words.length === 0) return []
    const fallback = median(words.map(word => word.y1))
    const rise = median(words.map(word => fallback - word.y0))
    const boxes = median(words.map(word => word.y1 - word.y0))
    const size = (rise > 0 ? rise / ASCENDER_SHARE : boxes) / scale

    return words.map(word => ({
      x:      word.x0 / scale,
      y:      pageHeight - (baselineAt(line, word, fallback) / scale),
      width:  (word.x1 - word.x0) / scale,
      height: size,
      text:   word.text.trim(),
    }))
  })
}
