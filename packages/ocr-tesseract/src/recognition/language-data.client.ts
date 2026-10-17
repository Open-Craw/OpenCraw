import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { OcrLanguageError } from './ocr-language.error'

/** The model the data packages keep the small LSTM ("best", quantised) models in: the size of a quick read, the accuracy of the slow one. */
const MODEL_FOLDER = '4.0.0_best_int'

/**
 * Where a language's model file is: in `langPath` when the caller keeps its own models, else in the `@tesseract.js-data/<language>` package (English
 * comes with this package; any other language is one `npm install @tesseract.js-data/<code>` away).
 */
function modelFile (language: string, langPath: string | undefined): string {
  if (langPath !== undefined) {
    const own = join(langPath, `${language}.traineddata.gz`)
    if (!existsSync(own)) throw new OcrLanguageError(`there is no "${language}.traineddata.gz" in ${langPath}`)

    return own
  }
  const require = createRequire(import.meta.url)
  try {
    return join(dirname(require.resolve(`@tesseract.js-data/${language}/package.json`)), MODEL_FOLDER, `${language}.traineddata.gz`)
  } catch (error) {
    throw new OcrLanguageError(`the OCR language data for "${language}" is not installed: npm install @tesseract.js-data/${language}, or give "langPath" a folder with ${language}.traineddata.gz`, { cause: error })
  }
}

/**
 * The folder Tesseract reads the models of these languages from. One language already lies in a folder of its own; several are gathered into one
 * (a folder under the system's temp folder, made once and reused) because Tesseract takes a single folder.
 *
 * @param languages - The Tesseract codes of the languages.
 * @param langPath - A folder of the caller's own models, if it keeps any.
 * @returns The folder.
 * @throws OcrLanguageError for a language with no model installed.
 */
export function languageFolder (languages: readonly string[], langPath: string | undefined): string {
  const files = languages.map(language => modelFile(language, langPath))
  if (langPath !== undefined) return langPath
  const [first] = files
  if (first !== undefined && files.length === 1) return dirname(first)
  const folder = join(tmpdir(), 'opencraw-ocr-models', [...languages].sort((a, b) => a.localeCompare(b)).join('+'))
  mkdirSync(folder, { recursive: true })
  for (const file of files) {
    const target = join(folder, basename(file))
    if (!existsSync(target)) copyFileSync(file, target)
  }

  return folder
}
