import { adaptiveBinarize, globalBinarize } from './binarize.algorithm'
import { estimateSkew, rotate, unrotate } from './deskew.algorithm'
import { flattenBackground } from './flatten-background.algorithm'
import { medianFilter } from './median-filter.algorithm'
import { grayImage } from './gray-image.model'
import type { GrayImage } from './gray-image.model'
import { grayOfPng, pngOfGray } from './png-gray.mapper'

/**
 * How a scanned page is cleaned before Tesseract reads it. Flattening the background and levelling the lines are on by default: measured on scans with shaded
 * paper or a crooked feed, they are the difference between reading nothing and reading every character. Binarizing is off by default: on a flattened page it gains
 * nothing over Tesseract's own, and at low resolution it thins strokes.
 */
export interface CleanupOptions {
  /** Take out shading and a tinted paper. Default true. */
  flatten?:  boolean
  /** Level the lines of a page that was fed in crooked: `true` finds the angle, a number is the angle to turn by (clockwise, degrees). Default true. */
  deskew?:   boolean | number
  /** Ink as pure black on white: `adaptive` follows the page, `global` is one threshold for all of it, `none` keeps the grays. Default none. */
  binarize?: 'adaptive' | 'global' | 'none'
  /** Take the grain out (a 3 by 3 median) before the ink is made black on white. Default false. */
  denoise?:  boolean
  /** White margin around the page, in pixels: Tesseract misses glyphs that touch the edge. Default 12. */
  padding?:  number
}

/** A cleaned page: its picture, and where its pixels came from on the picture it was made from. */
export interface CleanPage {
  png:         Uint8Array
  width:       number
  height:      number
  /** How far the page was turned to level its lines, clockwise degrees; 0 when it was level. */
  skewDegrees: number
  /** A position on the cleaned picture as a position on the original, undoing the margin and the turn. */
  toSource:    (point: { x: number, y: number }) => { x: number, y: number }
}

/** A skew smaller than this is the measurement's noise, not paper: the page is left as it is. */
const MIN_SKEW = 0.3

/**
 * Cleans a page picture for OCR: grayscale, the background flattened, the lines levelled, optionally the ink made black on white by a threshold that
 * follows the page, and a white margin. A scan is read better when it looks like a clean copy of what it was a picture of.
 *
 * @param png - The page, as PNG bytes.
 * @param options - What to do.
 * @returns The cleaned picture and how to map positions on it back to the original.
 */
export function cleanPage (png: Uint8Array, options: CleanupOptions = {}): CleanPage {
  let image: GrayImage = grayOfPng(png)
  const original = { width: image.width, height: image.height }
  if (options.flatten !== false) image = flattenBackground(image)
  let skew = 0
  if (typeof options.deskew === 'number') skew = options.deskew
  else if (options.deskew !== false) skew = estimateSkew(image)
  if (Math.abs(skew) < MIN_SKEW) skew = 0
  image = rotate(image, skew)
  if (options.denoise === true) image = medianFilter(image)
  const binarize = options.binarize ?? 'none'
  if (binarize === 'adaptive') image = adaptiveBinarize(image)
  else if (binarize === 'global') image = globalBinarize(image)
  const padding = Math.max(0, Math.round(options.padding ?? 12))
  const padded = grayImage(image.width + (2 * padding), image.height + (2 * padding))
  for (let y = 0; y < image.height; y += 1) padded.pixels.set(image.pixels.subarray(y * image.width, (y + 1) * image.width), ((y + padding) * padded.width) + padding)

  return {
    png:         pngOfGray(padded),
    width:       padded.width,
    height:      padded.height,
    skewDegrees: skew,
    toSource:    point => unrotate({ x: point.x - padding, y: point.y - padding }, skew, original),
  }
}
