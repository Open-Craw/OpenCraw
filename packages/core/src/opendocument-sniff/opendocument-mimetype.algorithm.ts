/** The OpenDocument kinds a file's own `mimetype` entry can name, and the body format each is read as. */
const KINDS: readonly (readonly [string, 'xlsx' | 'docx' | 'pptx'])[] = [
  ['application/vnd.oasis.opendocument.spreadsheet', 'xlsx'],
  ['application/vnd.oasis.opendocument.text', 'docx'],
  ['application/vnd.oasis.opendocument.presentation', 'pptx'],
]

const ZIP_LOCAL_HEADER = 0x04_03_4B_50
const MIMETYPE_NAME = 'mimetype'
/** The longest media type read: they are under 100 bytes. */
const MAX_MIMETYPE_BYTES = 256

function uint16 (bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
}

function uint32 (bytes: Uint8Array, at: number): number {
  return (uint16(bytes, at) | (uint16(bytes, at + 2) << 16)) >>> 0
}

/**
 * The media type an OpenDocument file declares: its first zip entry is a stored (uncompressed) `mimetype`, so it can be read without
 * opening the package. `undefined` for anything that is not a zip starting that way, which includes every Office Open XML file.
 *
 * @param bytes - The file.
 * @returns The media type (`application/vnd.oasis.opendocument.spreadsheet`), or `undefined`.
 */
export function openDocumentMimetype (bytes: Uint8Array): string | undefined {
  if (bytes.length < 38 || uint32(bytes, 0) !== ZIP_LOCAL_HEADER) return undefined
  const method = uint16(bytes, 8)
  const size = uint32(bytes, 18)
  const nameLength = uint16(bytes, 26)
  if (method !== 0 || nameLength !== MIMETYPE_NAME.length || size > MAX_MIMETYPE_BYTES) return undefined
  const extraLength = uint16(bytes, 28)
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength))
  if (name !== MIMETYPE_NAME) return undefined
  const start = 30 + nameLength + extraLength
  const mimetype = new TextDecoder().decode(bytes.subarray(start, start + size)).trim()

  return mimetype.startsWith('application/vnd.oasis.opendocument.') ? mimetype : undefined
}

/**
 * The body format an OpenDocument media type is read as: a spreadsheet is a workbook (`xlsx`), a text document a Word-like document (`docx`), a
 * presentation a deck (`pptx`), the way their readers produce the same models.
 *
 * @param mimetype - A media type (from `openDocumentMimetype`, or a response's content type).
 * @returns The body format, or `undefined` for a media type that is not one of those.
 */
export function openDocumentFormat (mimetype: string): 'xlsx' | 'docx' | 'pptx' | undefined {
  const type = mimetype.toLowerCase().split(';', 1)[0].trim()

  return KINDS.find(([candidate]) => type === candidate)?.[1]
}
