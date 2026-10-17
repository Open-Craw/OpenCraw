import { grayImage } from './gray-image.model'
import type { GrayImage } from './gray-image.model'
import { higherOf, lowerOf, roundedUp, wholePartOf } from './integer-math.algorithm'

const BLACK = 0
const WHITE = 255

/**
 * The threshold that best splits the values in two groups (Otsu's method): the one maximising the variance between ink and ground.
 *
 * @param values - One 0 to 255 value per pixel.
 * @returns The threshold: values at or under it are ink.
 */
export function otsuThreshold (values: Uint8Array): number {
  const histogram: number[] = Array.from({ length: 256 }, () => 0)
  for (const value of values) histogram[value] = (histogram[value] ?? 0) + 1
  const total = values.length
  let weighted = 0
  for (let level = 0; level < 256; level += 1) weighted += level * (histogram[level] ?? 0)
  let below = 0
  let belowWeighted = 0
  let best = 0
  let bestVariance = -1
  for (let level = 0; level < 256; level += 1) {
    below += histogram[level] ?? 0
    if (below === 0) continue
    const above = total - below
    if (above === 0) break
    belowWeighted += level * (histogram[level] ?? 0)
    const spread = (belowWeighted / below) - ((weighted - belowWeighted) / above)
    const variance = below * above * spread * spread
    if (variance > bestVariance) {
      bestVariance = variance
      best = level
    }
  }

  return best
}

/** Black ink on white from one global threshold. */
export function globalBinarize (image: GrayImage): GrayImage {
  const threshold = otsuThreshold(image.pixels)
  const out = grayImage(image.width, image.height)
  for (let at = 0; at < image.pixels.length; at += 1) out.pixels[at] = (image.pixels[at] ?? WHITE) <= threshold ? BLACK : WHITE

  return out
}

/**
 * Black ink on white from a threshold that follows the page (Sauvola's method): each pixel is compared with the mean of the window around it,
 * lowered where the window is flat, so shading and stains do not turn paper into ink and faint strokes are kept. Integral images make the cost
 * independent of the window's size.
 *
 * @param image - The scan, in gray.
 * @param window - The window's side in pixels, about the height of a line of text; default a sixteenth of the shorter side, at least 15.
 * @param sensitivity - How far below the local mean ink is taken to start; 0.2 for ordinary print.
 * @returns The picture, only black and white.
 */
export function adaptiveBinarize (image: GrayImage, window = higherOf(15, roundedUp(lowerOf(image.width, image.height) / 16)), sensitivity = 0.2): GrayImage {
  const { width, height, pixels } = image
  const columns = width + 1
  const sums = new Float64Array(columns * (height + 1))
  const squares = new Float64Array(columns * (height + 1))
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0
    let rowSquare = 0
    for (let x = 0; x < width; x += 1) {
      const value = pixels[(y * width) + x] ?? WHITE
      rowSum += value
      rowSquare += value * value
      sums[((y + 1) * columns) + x + 1] = (sums[(y * columns) + x + 1] ?? 0) + rowSum
      squares[((y + 1) * columns) + x + 1] = (squares[(y * columns) + x + 1] ?? 0) + rowSquare
    }
  }
  const half = wholePartOf(window / 2)
  const out = grayImage(width, height)
  for (let y = 0; y < height; y += 1) {
    const top = higherOf(0, y - half)
    const bottom = lowerOf(height - 1, y + half) + 1
    for (let x = 0; x < width; x += 1) {
      const left = higherOf(0, x - half)
      const right = lowerOf(width - 1, x + half) + 1
      const area = (right - left) * (bottom - top)
      const sum = (sums[(bottom * columns) + right] ?? 0) - (sums[(top * columns) + right] ?? 0) - (sums[(bottom * columns) + left] ?? 0) + (sums[(top * columns) + left] ?? 0)
      const square = (squares[(bottom * columns) + right] ?? 0) - (squares[(top * columns) + right] ?? 0) - (squares[(bottom * columns) + left] ?? 0) + (squares[(top * columns) + left] ?? 0)
      const mean = sum / area
      const variance = (square / area) - (mean * mean)
      const deviation = variance > 0 ? Math.sqrt(variance) : 0
      const threshold = mean * (1 + (sensitivity * ((deviation / 128) - 1)))
      out.pixels[(y * width) + x] = (pixels[(y * width) + x] ?? WHITE) <= threshold ? BLACK : WHITE
    }
  }

  return out
}
