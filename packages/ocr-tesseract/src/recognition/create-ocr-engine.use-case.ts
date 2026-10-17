import type { OcrEngine, OcrLine, OcrPageImage, OcrWord } from '@opencraw/core'
import type { Block } from 'tesseract.js'
import { cleanPage } from '../page-cleanup'
import type { CleanPage, CleanupOptions } from '../page-cleanup'
import { DEFAULT_LANGUAGE, tesseractLanguages } from './language-codes.policy'
import { TesseractWorkers } from './tesseract-ocr.client'
import type { TesseractOptions } from './tesseract-ocr.client'

/** How the engine reads pages. */
export interface OcrEngineOptions extends TesseractOptions {
  /** The languages to read when the recipe names none, as codes (`eng`, `ita`) or two-letter ones (`en`, `it`); default English. */
  languages?: readonly string[]
  /**
   * How each page is cleaned before it is read: one way, `false` for the picture as it is, or a list of ways tried in turn (the first whose reading is
   * good enough is kept, else the best). Default: flatten and straighten, and if that reads poorly, take the grain out and binarize.
   */
  cleanup?:   CleanupOptions | readonly CleanupOptions[] | false
}

interface Point {
  x: number
  y: number
}

/** The ways a page is cleaned, in the order tried: the gentle one reads most scans; one that reads poorly (grain, a stained page) is tried again binarized. */
const DEFAULT_PASSES: readonly CleanupOptions[] = [{ binarize: 'none' }, { binarize: 'adaptive', denoise: true }]

/** A reading with this many characters the engine is sure of, and a high average confidence, is good enough to stop: the next way of cleaning is not tried. */
const GOOD_CHARACTERS = 20
const GOOD_CONFIDENCE = 85
/** A word below this confidence is a guess: it does not count towards how good a reading is. */
const SURE = 60

/** How good a reading is: the characters in the words the engine is sure of, and their average confidence. */
function qualityOf (lines: readonly OcrLine[]): { characters: number, confidence: number } {
  const sure = lines.flatMap(line => line.words).filter(word => word.confidence >= SURE)
  const characters = sure.reduce((sum, word) => sum + word.text.trim().length, 0)

  return { characters, confidence: sure.length === 0 ? 0 : sure.reduce((sum, word) => sum + word.confidence, 0) / sure.length }
}

/** A box on the cleaned picture as a box on the original: the corners, put back where they were, and the box around them. */
function boxOnSource (clean: CleanPage, box: { x0: number, y0: number, x1: number, y1: number }): { x0: number, y0: number, x1: number, y1: number } {
  const corners: Point[] = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x0, y: box.y1 }, { x: box.x1, y: box.y1 }].map(corner => clean.toSource(corner))
  const xs = corners.map(corner => corner.x)
  const ys = corners.map(corner => corner.y)

  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** The lines Tesseract found, with every position put back on the original picture, the baseline's slant included. */
function linesOf (blocks: readonly Block[], clean: CleanPage): OcrLine[] {
  return blocks.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map((line): OcrLine => {
    const words: OcrWord[] = line.words.map(word => ({ text: word.text, confidence: word.confidence, ...boxOnSource(clean, word.bbox) }))
    const { baseline } = line
    // A line Tesseract found no baseline for has one with no length.
    if (baseline.x1 <= baseline.x0) return { words }
    const from = clean.toSource({ x: baseline.x0, y: baseline.y0 })
    const to = clean.toSource({ x: baseline.x1, y: baseline.y1 })

    return { words, baseline: { x0: from.x, y0: from.y, x1: to.x, y1: to.y } }
  })))
}

/** The ways to clean a page, as the engine was configured: a list is a list of passes, one way is one pass, `false` is the picture as it is. */
function passes (cleanup: OcrEngineOptions['cleanup']): readonly (CleanupOptions | false)[] {
  if (cleanup === undefined) return DEFAULT_PASSES
  if (cleanup === false) return [false]

  return Array.isArray(cleanup) ? cleanup : [cleanup as CleanupOptions]
}

/** A cleaned page that is the picture as it was given. */
function untouched (image: OcrPageImage): CleanPage {
  return { png: image.png, width: image.width, height: image.height, skewDegrees: 0, toSource: point => point }
}

/** Reads the page with each way of cleaning it in turn: the first reading that is good enough is kept, else the one with the most characters the engine is sure of. */
async function readPasses (ways: readonly (CleanupOptions | false)[], image: OcrPageImage, languages: readonly string[], workers: TesseractWorkers): Promise<OcrLine[]> {
  let best: { lines: OcrLine[], characters: number } | undefined
  for (const way of ways) {
    const clean = way === false ? untouched(image) : cleanPage(image.png, way)
    const lines = linesOf(await workers.read(clean.png, languages, image.scale * 72), clean)
    const quality = qualityOf(lines)
    if (quality.characters >= GOOD_CHARACTERS && quality.confidence >= GOOD_CONFIDENCE) return lines
    if (best === undefined || quality.characters > best.characters) best = { lines, characters: quality.characters }
  }

  return best?.lines ?? []
}

/**
 * An OCR engine for `@opencraw/core`: each page picture is cleaned (background flattened, lines levelled; if that reads poorly, the grain taken out and
 * the ink made black on white), read by Tesseract, and every word handed back where it sits on the picture it was given, whatever the cleaning did to
 * the geometry.
 *
 * @param options - Default languages, cleanup, and where models live.
 * @returns The engine. Call `dispose` when done, to stop the Tesseract worker threads.
 */
export function createOcrEngine (options: OcrEngineOptions = {}): OcrEngine {
  const workers = new TesseractWorkers(options)
  const defaults = tesseractLanguages(options.languages ?? [DEFAULT_LANGUAGE])
  const ways = passes(options.cleanup)

  return {
    name:      'tesseract',
    recognize: async (image, requested) => await readPasses(ways, image, requested.languages.length > 0 ? tesseractLanguages(requested.languages) : defaults, workers),
    dispose:   async () => { await workers.close() },
  }
}
