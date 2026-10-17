/** A picture in shades of gray: one 0 (black) to 255 (white) value per pixel, rows top to bottom. */
export interface GrayImage {
  width:  number
  height: number
  pixels: Uint8Array
}

/**
 * A blank picture.
 *
 * @param width - Pixels across.
 * @param height - Pixels down.
 * @param fill - The gray every pixel starts as; default white.
 * @returns The picture.
 */
export function grayImage (width: number, height: number, fill = 255): GrayImage {
  return { width, height, pixels: new Uint8Array(width * height).fill(fill) }
}
