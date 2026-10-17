/** A PDF page as an OCR engine reads it: the page rendered to a PNG, `scale` pixels to each point of the page. */
export interface OcrPageImage {
  png:    Uint8Array
  width:  number
  height: number
  scale:  number
}

/** One word an engine found, its box in the image's pixels, y growing downwards from the top edge. */
export interface OcrWord {
  text:       string
  x0:         number
  y0:         number
  x1:         number
  y1:         number
  /** How sure the engine is, 0 to 100. */
  confidence: number
}

/** One line of text an engine found: its words left to right, and the line the baseline runs along, when the engine measures it. */
export interface OcrLine {
  words:     OcrWord[]
  /** The baseline under the line's letters, from its left end to its right end, in the image's pixels. It follows a scan that was fed in crooked. */
  baseline?: { x0: number, y0: number, x1: number, y1: number }
}

/** What to read a page for. */
export interface OcrOptions {
  /** The languages the page is written in, as Tesseract names them (`eng`, `ita`, `por`, `chi_sim`); the engine's own default when empty. */
  languages: readonly string[]
}

/**
 * Reads text from the picture of a page. `@opencraw/ocr-tesseract` is the engine OpenCraw ships; anything that answers this can stand in for it
 * (a cloud service, another local engine), handed to the crawler as `ocr`.
 */
export interface OcrEngine {
  readonly name: string
  recognize:     (image: OcrPageImage, options: OcrOptions) => Promise<OcrLine[]>
  /** Stops what the engine started (worker threads, a loaded model); called when the client that loaded it is disposed. */
  dispose?:      () => Promise<void>
}

/** What a recipe's `ocr` says: the languages (Tesseract codes, default English), whether pages that have text are read again, the resolution to render at. */
export interface OcrSetting {
  languages?: readonly string[]
  always?:    boolean
  dpi?:       number
}

/** The OCR a PDF is read with: which engine (loaded when a page first needs it), in which languages, and whether pages that have text are read again. */
export interface PdfOcr {
  engine:     () => Promise<OcrEngine>
  languages?: readonly string[]
  /** Read every page by OCR and drop the text layer, for a PDF whose text layer is wrong (a scan somebody ran bad OCR over). Default: only pages with no text. */
  always?:    boolean
  /** The resolution a page is rendered at for the engine, in dots per inch. Default: the scan's own resolution, between 150 and 300; more only blurs a soft scan. */
  dpi?:       number
}
