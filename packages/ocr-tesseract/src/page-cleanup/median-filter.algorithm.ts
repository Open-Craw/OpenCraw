import { grayImage } from './gray-image.model'
import type { GrayImage } from './gray-image.model'

/** The middle value of nine, by insertion sort on a small buffer: no allocation and no generic sort per pixel. */
function medianOfNine (values: Uint8Array): number {
  for (let at = 1; at < 9; at += 1) {
    const value = values[at] ?? 0
    let before = at - 1
    while (before >= 0 && (values[before] ?? 0) > value) {
      values[before + 1] = values[before] ?? 0
      before -= 1
    }
    values[before + 1] = value
  }

  return values[4] ?? 255
}

/**
 * Replaces each pixel by the median of the 3 by 3 around it: the speckle of a grainy scan or a photocopy goes, and strokes keep their edges (a mean
 * would smear them). The picture's edge repeats outward.
 *
 * @param image - The picture.
 * @returns The picture without the grain.
 */
export function medianFilter (image: GrayImage): GrayImage {
  const { width, height, pixels } = image
  const out = grayImage(width, height)
  const around = new Uint8Array(9)
  for (let y = 0; y < height; y += 1) {
    const above = (y > 0 ? y - 1 : 0) * width
    const here = y * width
    const below = (y < height - 1 ? y + 1 : y) * width
    for (let x = 0; x < width; x += 1) {
      const left = x > 0 ? x - 1 : 0
      const right = x < width - 1 ? x + 1 : x
      around[0] = pixels[above + left] ?? 255
      around[1] = pixels[above + x] ?? 255
      around[2] = pixels[above + right] ?? 255
      around[3] = pixels[here + left] ?? 255
      around[4] = pixels[here + x] ?? 255
      around[5] = pixels[here + right] ?? 255
      around[6] = pixels[below + left] ?? 255
      around[7] = pixels[below + x] ?? 255
      around[8] = pixels[below + right] ?? 255
      out.pixels[here + x] = medianOfNine(around)
    }
  }

  return out
}
