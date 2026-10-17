import type { PdfPageOcr } from '../pdf-document'
import type { OcrEngine, OcrSetting } from './ocr-engine.contract'
import { pdfPageOcr } from './ocr-page.use-case'

/** The package that reads pictures; it is not a dependency of core (it brings a WebAssembly engine and a language model), so it is loaded when a recipe asks for OCR. */
const ENGINE_PACKAGE = '@opencraw/ocr-tesseract'

/** The engine package, loaded by name so no bundler or compiler tries to resolve it ahead of time. */
async function loadEngine (): Promise<OcrEngine> {
  let loaded: { createOcrEngine?: () => OcrEngine }
  try {
    loaded = await import(/* webpackIgnore: true */ ENGINE_PACKAGE) as typeof loaded
  } catch (error) {
    throw new Error(`OCR needs the ${ENGINE_PACKAGE} package: install it (npm install ${ENGINE_PACKAGE}) next to @opencraw/core`, { cause: error })
  }
  if (loaded.createOcrEngine === undefined) throw new Error(`${ENGINE_PACKAGE} does not export createOcrEngine: it is too old for this version of @opencraw/core`)

  return loaded.createOcrEngine()
}

/**
 * Runs a PDF read with OCR from a recipe's `ocr` setting. The engine starts when a page first needs it and its worker threads are stopped when the
 * read ends, whether it succeeds or not.
 *
 * @param setting - `true` for the defaults (English, pages with no text), or the languages, `always` and `dpi`.
 * @param run - The read, given the OCR to pass to `readPdf`.
 * @returns What the read returns.
 */
export async function withOcr<T> (setting: true | OcrSetting, run: (ocr: PdfPageOcr) => Promise<T>): Promise<T> {
  const options = setting === true ? {} : setting
  let engine: OcrEngine | undefined
  try {
    return await run(pdfPageOcr({
      ...options,
      engine: async () => {
        engine ??= await loadEngine()

        return engine
      },
    }))
  } finally {
    await engine?.dispose?.()
  }
}
