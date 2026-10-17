/** A language the page is to be read in has no model installed, with what to install. */
export class OcrLanguageError extends Error {
  override readonly name = 'OcrLanguageError'
}
