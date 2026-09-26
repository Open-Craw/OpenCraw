import { PNG } from 'pngjs'
import { FAST_PNG } from './clean-image.algorithm'

const WHITE = 255
const INK_UNDER = 128

/**
 * Pulls the glyphs of a cleaned image apart: each run of columns holding ink
 * (a character, or characters that touch) is laid out again with `gap` white
 * columns between runs. Tesseract reads a line with context and can bend a
 * character to fit its neighbours (a `4` after lowercase letters read as
 * `a`); spaced apart, each is read more on its own shape.
 *
 * Like reading a word letter by letter with a finger under each one.
 *
 * @param png - A cleaned image (black ink on white), as PNG bytes.
 * @param gap - White columns before, between and after the runs.
 * @returns The respaced image, as PNG bytes; the same height.
 */
export function respaceGlyphs (png: Buffer, gap: number): Buffer {
  const image = PNG.sync.read(png)
  const runs = inkRuns(image)
  const width = runs.reduce((total, [start, end]) => total + (end - start) + gap, gap)
  const out = new PNG({ width, height: image.height })
  out.data.fill(WHITE)
  let at = gap
  for (const [start, end] of runs) {
    for (let y = 0; y < image.height; y += 1) {
      const from = ((y * image.width) + start) * 4
      image.data.copy(out.data, ((y * width) + at) * 4, from, from + ((end - start) * 4))
    }
    at += (end - start) + gap
  }

  return PNG.sync.write(out, FAST_PNG)
}

/** The column ranges `[start, end)` that hold ink, left to right. */
function inkRuns (image: PNG): [number, number][] {
  const runs: [number, number][] = []
  let start = -1
  for (let x = 0; x < image.width; x += 1) {
    const ink = hasInk(image, x)
    if (ink && start < 0) start = x
    if (!ink && start >= 0) {
      runs.push([start, x])
      start = -1
    }
  }
  if (start >= 0) runs.push([start, image.width])

  return runs
}

function hasInk (image: PNG, x: number): boolean {
  for (let y = 0; y < image.height; y += 1) {
    if (image.data[((y * image.width) + x) * 4] < INK_UNDER) return true
  }

  return false
}
