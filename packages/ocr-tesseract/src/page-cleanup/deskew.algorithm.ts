import { otsuThreshold } from './binarize.algorithm'
import { grayImage } from './gray-image.model'
import type { GrayImage } from './gray-image.model'
import { higherOf, roundedUp, wholePartOf } from './integer-math.algorithm'

/** The long side the skew is measured on: a scan's skew shows at a fraction of its size, and the measure is quadratic in pixels. */
const MEASURE_SIDE = 700
/** The most points of ink looked at: the skew shows in a sample as well as in all of them. */
const MAX_POINTS = 60_000

interface Point {
  x: number
  y: number
}

/** The picture shrunk by whole-pixel averaging so its long side is about `side`, and how many times smaller it is. */
function shrunk (image: GrayImage, side: number): { image: GrayImage, factor: number } {
  const factor = higherOf(1, wholePartOf(higherOf(image.width, image.height) / side))
  if (factor === 1) return { image, factor }
  const width = wholePartOf(image.width / factor)
  const height = wholePartOf(image.height / factor)
  const out = grayImage(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      for (let dy = 0; dy < factor; dy += 1) for (let dx = 0; dx < factor; dx += 1) sum += image.pixels[(((y * factor) + dy) * image.width) + (x * factor) + dx] ?? 255
      out.pixels[(y * width) + x] = roundedUp(sum / (factor * factor))
    }
  }

  return { image: out, factor }
}

/** The ink's coordinates around the picture's centre, thinned to at most {@link MAX_POINTS}. */
function inkPoints (image: GrayImage): Point[] {
  const threshold = otsuThreshold(image.pixels)
  const points: Point[] = []
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) if ((image.pixels[(y * image.width) + x] ?? 255) <= threshold) points.push({ x: x - (image.width / 2), y: y - (image.height / 2) })
  }
  const every = higherOf(1, Math.ceil(points.length / MAX_POINTS))

  return every === 1 ? points : points.filter((_, index) => index % every === 0)
}

/** How sharply the ink falls into rows when the page is turned by `degrees`: rows of text and the gaps between them make a spiky histogram only when the lines are level. */
function sharpness (points: readonly Point[], degrees: number, rows: number): number {
  const radians = (degrees * Math.PI) / 180
  const sine = Math.sin(radians)
  const cosine = Math.cos(radians)
  const histogram = new Float64Array(rows)
  for (const point of points) {
    const position = (point.x * sine) + (point.y * cosine) + (rows / 2)
    const row = position < 0 ? -1 : roundedUp(position)
    if (row >= 0 && row < rows) histogram[row] = (histogram[row] ?? 0) + 1
  }
  let sum = 0
  for (const count of histogram) sum += count * count

  return sum
}

/**
 * How much a scan was fed in crooked, in degrees, from the sharpness of its rows of text: turning the page by the right amount makes the lines
 * level, and the ink then falls into few, full rows. Searched coarsely over `maxDegrees` either way, then finely around the best.
 *
 * @param image - The scan, in gray.
 * @param maxDegrees - The most skew looked for either way; default 5.
 * @returns The angle to turn the picture by (clockwise, degrees) to level the text; 0 when there is no text to measure.
 */
export function estimateSkew (image: GrayImage, maxDegrees = 5): number {
  const { image: small } = shrunk(image, MEASURE_SIDE)
  const points = inkPoints(small)
  if (points.length < 200) return 0
  const rows = Math.ceil(Math.hypot(small.width, small.height)) + 2
  let best = 0
  let bestScore = sharpness(points, 0, rows)
  for (let degrees = -maxDegrees; degrees <= maxDegrees; degrees += 0.5) {
    const score = sharpness(points, degrees, rows)
    if (score > bestScore) {
      best = degrees
      bestScore = score
    }
  }
  const around = best
  for (let degrees = around - 0.5; degrees <= around + 0.5; degrees += 0.05) {
    const score = sharpness(points, degrees, rows)
    if (score > bestScore) {
      best = degrees
      bestScore = score
    }
  }

  return Math.round(best * 100) / 100
}

/** The picture's value at a position between pixels (bilinear), white where the position is off the picture. */
function sampled (image: GrayImage, x: number, y: number): number {
  const { width, height, pixels } = image
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 255
  const left = wholePartOf(x)
  const top = wholePartOf(y)
  const right = left < width - 1 ? left + 1 : left
  const below = top < height - 1 ? top + 1 : top
  const fx = x - left
  const fy = y - top
  const value = ((pixels[(top * width) + left] ?? 255) * (1 - fx) * (1 - fy)) + ((pixels[(top * width) + right] ?? 255) * fx * (1 - fy)) + ((pixels[(below * width) + left] ?? 255) * (1 - fx) * fy) + ((pixels[(below * width) + right] ?? 255) * fx * fy)

  return roundedUp(value)
}

/**
 * Turns a picture clockwise about its centre, the corners it uncovers white and the edges smoothed (bilinear). The picture keeps its size.
 *
 * @param image - The picture.
 * @param degrees - How far to turn it, clockwise.
 * @returns The turned picture.
 */
export function rotate (image: GrayImage, degrees: number): GrayImage {
  if (degrees === 0) return image
  const radians = (degrees * Math.PI) / 180
  const sine = Math.sin(radians)
  const cosine = Math.cos(radians)
  const centreX = image.width / 2
  const centreY = image.height / 2
  const out = grayImage(image.width, image.height)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      // Where this pixel came from: the output turned back by the same angle.
      const dx = x - centreX
      const dy = y - centreY
      const sourceX = (dx * cosine) + (dy * sine) + centreX
      const sourceY = (-dx * sine) + (dy * cosine) + centreY
      out.pixels[(y * image.width) + x] = sampled(image, sourceX, sourceY)
    }
  }

  return out
}

/**
 * Where a point of the turned picture was in the picture before it was turned: the inverse of {@link rotate}, to put what was read from a straightened
 * page back where it sits on the original.
 *
 * @param point - A position in the turned picture.
 * @param degrees - The angle the picture was turned by.
 * @param size - The picture's size.
 * @returns The position in the original.
 */
export function unrotate (point: { x: number, y: number }, degrees: number, size: { width: number, height: number }): { x: number, y: number } {
  const radians = (degrees * Math.PI) / 180
  const sine = Math.sin(radians)
  const cosine = Math.cos(radians)
  const dx = point.x - (size.width / 2)
  const dy = point.y - (size.height / 2)

  // The same mapping `rotate` uses to find where each output pixel came from.
  return { x: (dx * cosine) + (dy * sine) + (size.width / 2), y: (-dx * sine) + (dy * cosine) + (size.height / 2) }
}
