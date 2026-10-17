import { adaptiveBinarize, globalBinarize, otsuThreshold } from './binarize.algorithm'
import { cleanPage } from './clean-page.use-case'
import { estimateSkew, rotate, unrotate } from './deskew.algorithm'
import { flattenBackground } from './flatten-background.algorithm'
import { grayImage } from './gray-image.model'
import type { GrayImage } from './gray-image.model'
import { medianFilter } from './median-filter.algorithm'
import { grayOfPng, pngOfGray } from './png-gray.mapper'

/** A page of text-like lines: rows of black dashes (words) on white, level. */
function textLikePage (width = 800, height = 600): GrayImage {
  const image = grayImage(width, height)
  for (let line = 0; line < 12; line += 1) {
    const top = 60 + (line * 40)
    let x = 60
    while (x < width - 80) {
      const word = 30 + ((x * 7 + line * 13) % 60)
      for (let y = top; y < top + 14; y += 1) for (let dx = 0; dx < word; dx += 1) image.pixels[(y * width) + x + dx] = 0
      x += word + 14
    }
  }

  return image
}

describe('png-gray', () => {
  it('goes from a gray picture to a PNG and back, and counts a transparent pixel as paper', () => {
    const image = grayImage(4, 2)
    image.pixels.set([0, 50, 100, 150, 200, 255, 10, 20])

    const back = grayOfPng(pngOfGray(image))

    expect([back.width, back.height, [...back.pixels]]).toEqual([4, 2, [0, 50, 100, 150, 200, 255, 10, 20]])
  })
})

describe('flattenBackground', () => {
  it('brings paper that is shaded across the page to white and leaves the ink dark', () => {
    const image = grayImage(400, 300)
    // The paper goes from 120 on the left to 230 on the right; a bar of ink sits in the dark part and one in the light part.
    for (let y = 0; y < 300; y += 1) for (let x = 0; x < 400; x += 1) image.pixels[(y * 400) + x] = Math.round(120 + ((x / 399) * 110))
    for (let y = 100; y < 112; y += 1) for (let x = 40; x < 140; x += 1) image.pixels[(y * 400) + x] = 20
    for (let y = 100; y < 112; y += 1) for (let x = 260; x < 360; x += 1) image.pixels[(y * 400) + x] = 90

    const flat = flattenBackground(image)

    const paper = [10, 200, 390].map(x => flat.pixels[(250 * 400) + x] ?? 0)
    expect(Math.min(...paper)).toBeGreaterThanOrEqual(245)
    expect(flat.pixels[(105 * 400) + 90]).toBeLessThan(40)
    expect(flat.pixels[(105 * 400) + 310]).toBeLessThan(140)
  })
})

describe('skew', () => {
  it('finds how far a page was turned, from its lines of text', () => {
    const level = textLikePage()
    const crooked = rotate(level, 2.5)

    expect(Math.abs(estimateSkew(level))).toBeLessThan(0.3)
    expect(estimateSkew(crooked)).toBeCloseTo(-2.5, 0)
    expect(Math.abs(estimateSkew(crooked) + 2.5)).toBeLessThan(0.3)
  })

  it('has no skew to find in a page with nothing on it', () => {
    expect(estimateSkew(grayImage(300, 300))).toBe(0)
  })

  it('turns a picture and puts a position back where it was', () => {
    const image = grayImage(300, 200)
    for (let y = 58; y < 62; y += 1) for (let x = 218; x < 222; x += 1) image.pixels[(y * 300) + x] = 0

    const turned = rotate(image, 12)
    // eslint-disable-next-line unicorn/prefer-iterator-to-array -- this package's lib has no Iterator#toArray
    const ink = [...turned.pixels.entries()].filter(([, value]) => value < 128).map(([at]) => ({ x: at % 300, y: Math.floor(at / 300) }))
    const count = ink.length
    const found = { x: ink.reduce((sum, point) => sum + point.x, 0) / count, y: ink.reduce((sum, point) => sum + point.y, 0) / count }

    expect(count).toBeGreaterThan(8)
    expect(Math.hypot(found.x - 220, found.y - 60)).toBeGreaterThan(10)
    const back = unrotate(found, 12, { width: 300, height: 200 })
    // Within a pixel: the turn smooths the dot, which moves its centre a little.
    expect(Math.hypot(back.x - 220, back.y - 60)).toBeLessThan(1.5)
  })

  it('leaves a picture alone for no turn', () => {
    const image = textLikePage(100, 100)

    expect(rotate(image, 0)).toBe(image)
  })
})

describe('binarize', () => {
  it('splits a page of two grays at the threshold between them', () => {
    const values = new Uint8Array(1000)
    values.fill(220, 0, 700)
    values.fill(40, 700)

    const threshold = otsuThreshold(values)

    expect(threshold).toBeGreaterThanOrEqual(40)
    expect(threshold).toBeLessThan(220)
  })

  it('makes ink black on white, one global threshold or one that follows the page', () => {
    const image = grayImage(300, 200)
    for (let y = 0; y < 200; y += 1) for (let x = 0; x < 300; x += 1) image.pixels[(y * 300) + x] = 150 + Math.round((x / 299) * 90)
    for (let y = 90; y < 100; y += 1) for (let x = 20; x < 120; x += 1) image.pixels[(y * 300) + x] = 80
    for (let y = 90; y < 100; y += 1) for (let x = 190; x < 290; x += 1) image.pixels[(y * 300) + x] = 160

    // A window wider than the strokes: the default scales with a real page, which this small picture is not.
    const adaptive = adaptiveBinarize(image, 41)
    const global = globalBinarize(image)

    expect(new Set(adaptive.pixels)).toEqual(new Set([0, 255]))
    // The ink in the dark part and the faint ink in the light part are both found, the shaded paper is not turned to ink.
    expect(adaptive.pixels[(95 * 300) + 70]).toBe(0)
    expect(adaptive.pixels[(95 * 300) + 240]).toBe(0)
    expect(adaptive.pixels[(30 * 300) + 20]).toBe(255)
    expect(adaptive.pixels[(30 * 300) + 280]).toBe(255)
    expect(new Set(global.pixels)).toEqual(new Set([0, 255]))
  })
})

describe('cleanPage', () => {
  it('levels a crooked page, adds a margin, and says where each position on the clean picture is on the original', () => {
    const level = textLikePage()
    const crooked = rotate(level, 2.2)

    const clean = cleanPage(pngOfGray(crooked), { padding: 10, binarize: 'adaptive' })

    expect(Math.abs(clean.skewDegrees + 2.2)).toBeLessThan(0.3)
    expect([clean.width, clean.height]).toEqual([820, 620])
    // The page's centre is the centre of the original, whatever the margin and the turn.
    const centre = clean.toSource({ x: 410, y: 310 })
    expect(centre.x).toBeCloseTo(400, 0)
    expect(centre.y).toBeCloseTo(300, 0)
    // A position at the top left of the clean text maps back near the top of the tilted page.
    const decoded = grayOfPng(clean.png)
    expect(new Set(decoded.pixels)).toEqual(new Set([0, 255]))
  })

  it('leaves a level page unturned, and does only what it is asked to', () => {
    const level = textLikePage()
    const clean = cleanPage(pngOfGray(level), { padding: 0, binarize: 'none', flatten: false, deskew: false })

    expect(clean.skewDegrees).toBe(0)
    expect([...grayOfPng(clean.png).pixels]).toEqual([...level.pixels])
    expect(cleanPage(pngOfGray(level), { padding: 0, deskew: 4 }).skewDegrees).toBe(4)
  })
})

describe('medianFilter', () => {
  it('takes isolated specks out and keeps a stroke\'s edge where it is', () => {
    const image = grayImage(40, 20)
    for (let y = 0; y < 20; y += 1) for (let x = 20; x < 40; x += 1) image.pixels[(y * 40) + x] = 0
    image.pixels[(10 * 40) + 5] = 0
    image.pixels[(5 * 40) + 30] = 255

    const filtered = medianFilter(image)

    expect(filtered.pixels[(10 * 40) + 5]).toBe(255)
    expect(filtered.pixels[(5 * 40) + 30]).toBe(0)
    expect(filtered.pixels[(10 * 40) + 19]).toBe(255)
    expect(filtered.pixels[(10 * 40) + 20]).toBe(0)
  })
})
