/** An output file whose extension names no format the records can be written in. */
export class UnsupportedOutputFormatError extends Error {
  readonly path:      string
  readonly extension: string

  constructor (path: string, extension: string) {
    const shown = extension === '' ? 'has no extension' : `ends in "${extension}"`
    super(`cannot write records to "${path}": it ${shown}. Name the file .jsonl, .json, .csv, .xlsx, .yml (or .yaml), .html or .pdf: the extension chooses the format.`)
    this.name = 'UnsupportedOutputFormatError'
    this.path = path
    this.extension = extension
  }
}
