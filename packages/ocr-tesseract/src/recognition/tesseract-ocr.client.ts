import { createWorker, OEM } from 'tesseract.js'
import type { Block, PSM, Worker } from 'tesseract.js'
import { languageFolder } from './language-data.client'

/** The page segmentation Tesseract is run with: it finds the blocks and lines itself (`3`), which is what a page of columns, tables and paragraphs needs. */
const AUTO_SEGMENTATION = '3'

export interface TesseractOptions {
  /** A folder of `<language>.traineddata.gz` files of the caller's own; default: the `@tesseract.js-data` packages. */
  langPath?:     string
  /** Tesseract's page segmentation mode; default 3, automatic. */
  segmentation?: string
}

/**
 * Tesseract, in worker threads running WebAssembly, one per set of languages and started when a page first needs it. Models come from disk,
 * never from a CDN, and nothing is cached in the working directory. Pages queue on their worker.
 */
export class TesseractWorkers {
  private readonly workers = new Map<string, Promise<Worker>>()

  constructor (private readonly options: TesseractOptions = {}) {}

  private async start (languages: readonly string[]): Promise<Worker> {
    const key = languages.join('+')
    const existing = this.workers.get(key)
    if (existing !== undefined) return await existing
    const pending = createWorker([...languages], OEM.LSTM_ONLY, { langPath: languageFolder(languages, this.options.langPath), gzip: true, cacheMethod: 'none' })
    this.workers.set(key, pending)
    try {
      const worker = await pending
      await worker.setParameters({ tessedit_pageseg_mode: (this.options.segmentation ?? AUTO_SEGMENTATION) as PSM, preserve_interword_spaces: '1' })

      return worker
    } catch (error) {
      // A failed start is not kept: the next page tries again (a model installed in the meantime is found).
      this.workers.delete(key)
      throw error
    }
  }

  /**
   * Reads one picture.
   *
   * @param png - The page, cleaned.
   * @param languages - The Tesseract codes of the languages it is written in.
   * @param dpi - The picture's resolution: Tesseract sizes its reading by it, and guesses (and says so on the console) when it is not told.
   * @returns Tesseract's blocks: paragraphs, lines and words with their boxes and confidence.
   */
  async read (png: Uint8Array, languages: readonly string[], dpi: number): Promise<Block[]> {
    const worker = await this.start(languages)
    const resolution = Math.max(70, Math.round(dpi))
    await worker.setParameters({ user_defined_dpi: String(resolution) })
    const { data } = await worker.recognize(Buffer.from(png), {}, { blocks: true })

    return data.blocks ?? []
  }

  /** Stops every worker thread. */
  async close (): Promise<void> {
    // eslint-disable-next-line unicorn/prefer-iterator-to-array -- this package's lib has no Iterator#toArray
    const started = [...this.workers.values()]
    this.workers.clear()
    for (const pending of started) {
      try {
        const worker = await pending
        await worker.terminate()
      } catch {
        // A worker that never started has nothing to stop.
      }
    }
  }
}
