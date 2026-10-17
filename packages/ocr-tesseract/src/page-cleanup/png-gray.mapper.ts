import { PNG } from 'pngjs'
import { grayImage } from './gray-image.model'
import type { GrayImage } from './gray-image.model'
import { roundedUp } from './integer-math.algorithm'

/** PNG output for Tesseract, not for storage: no row filter search and light compression, many times faster to write. */
const FAST_PNG = { filterType: 0, deflateLevel: 1 }

/**
 * A PNG as a gray picture: luminance by the usual weights, a transparent pixel counted as white paper.
 *
 * @param png - The PNG's bytes.
 * @returns The picture.
 */
export function grayOfPng (png: Uint8Array): GrayImage {
  const decoded = PNG.sync.read(Buffer.from(png))
  const image = grayImage(decoded.width, decoded.height)
  for (let pixel = 0; pixel < decoded.width * decoded.height; pixel += 1) {
    const at = pixel * 4
    const alpha = (decoded.data[at + 3] ?? 255) / 255
    const luminance = (0.299 * (decoded.data[at] ?? 0)) + (0.587 * (decoded.data[at + 1] ?? 0)) + (0.114 * (decoded.data[at + 2] ?? 0))
    image.pixels[pixel] = roundedUp((luminance * alpha) + (255 * (1 - alpha)))
  }

  return image
}

/**
 * A gray picture as a PNG.
 *
 * @param image - The picture.
 * @returns The PNG's bytes.
 */
export function pngOfGray (image: GrayImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height })
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const value = image.pixels[pixel] ?? 255
    const at = pixel * 4
    png.data[at] = value
    png.data[at + 1] = value
    png.data[at + 2] = value
    png.data[at + 3] = 255
  }

  return PNG.sync.write(png, FAST_PNG)
}
