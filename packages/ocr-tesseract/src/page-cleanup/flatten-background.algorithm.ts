import { grayImage } from './gray-image.model'
import type { GrayImage } from './gray-image.model'
import { higherOf, lowerOf, roundedUp } from './integer-math.algorithm'

/** The ink is thinner than this many pixels at the page's usual scale, so the background estimate (the lightest pixel around) steps over it. */
const INK_RADIUS = 6

/** Running maximum along one axis, window `2 * radius + 1`: the lightest value around each pixel. */
function lightest (values: Uint8Array, width: number, height: number, radius: number, vertical: boolean): Uint8Array {
  const out = new Uint8Array(values.length)
  const length = vertical ? height : width
  const lines = vertical ? width : height
  const stride = vertical ? width : 1
  const step = vertical ? 1 : width
  for (let line = 0; line < lines; line += 1) {
    const start = line * step
    for (let at = 0; at < length; at += 1) {
      const from = higherOf(0, at - radius)
      const to = lowerOf(length - 1, at + radius)
      let best = 0
      for (let near = from; near <= to; near += 1) {
        const value = values[start + (near * stride)] ?? 0
        if (value > best) best = value
      }
      out[start + (at * stride)] = best
    }
  }

  return out
}

/** Box blur along one axis, window `2 * radius + 1`, by running sums: the cost does not grow with the radius. */
function averaged (values: Uint8Array, width: number, height: number, radius: number, vertical: boolean): Uint8Array {
  const out = new Uint8Array(values.length)
  const length = vertical ? height : width
  const lines = vertical ? width : height
  const stride = vertical ? width : 1
  const step = vertical ? 1 : width
  for (let line = 0; line < lines; line += 1) {
    const start = line * step
    let sum = 0
    let count = 0
    for (let near = 0; near <= lowerOf(length - 1, radius); near += 1) {
      sum += values[start + (near * stride)] ?? 0
      count += 1
    }
    for (let at = 0; at < length; at += 1) {
      out[start + (at * stride)] = roundedUp(sum / count)
      const entering = at + radius + 1
      const leaving = at - radius
      if (entering < length) {
        sum += values[start + (entering * stride)] ?? 0
        count += 1
      }
      if (leaving >= 0) {
        sum -= values[start + (leaving * stride)] ?? 0
        count -= 1
      }
    }
  }

  return out
}

/**
 * Takes the shading out of a scan: yellowed paper, a darker edge near the spine, the lamp's fall-off. The page's background is estimated as the
 * lightest pixel around each one (which steps over ink), smoothed, and every pixel is divided by it, so paper comes out white wherever it was
 * and ink stays dark. Like photocopying with the lid raised.
 *
 * @param image - The scan, in gray.
 * @returns The flattened picture.
 */
export function flattenBackground (image: GrayImage): GrayImage {
  const { width, height, pixels } = image
  const smooth = higherOf(12, roundedUp(lowerOf(width, height) / 25))
  let background = lightest(lightest(pixels, width, height, INK_RADIUS, false), width, height, INK_RADIUS, true)
  background = averaged(averaged(background, width, height, smooth, false), width, height, smooth, true)
  const out = grayImage(width, height)
  for (const [at, pixel] of pixels.entries()) {
    const paper = background[at] ?? 255
    const value = roundedUp(((pixel ?? 255) * 255) / (Math.max(paper, 1)))
    out.pixels[at] = Math.min(value, 255)
  }

  return out
}
