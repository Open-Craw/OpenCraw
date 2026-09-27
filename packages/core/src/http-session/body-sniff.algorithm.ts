/** A format a body's first bytes can prove. */
export type SniffedFormat = 'pdf' | 'xlsx' | 'pptx' | 'docx' | 'xml'

/** How far into a body `%PDF-` may start: the PDF readers accept a little junk before the header. */
const PDF_WINDOW = 1024
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2D]
const ZIP_LOCAL_HEADER = 0x04_03_4B_50
const ZIP_CENTRAL_HEADER = 0x02_01_4B_50
const ZIP_END_OF_DIRECTORY = 0x06_05_4B_50
/** The end-of-directory record is 22 bytes, plus a comment of at most 65 535. */
const ZIP_END_WINDOW = 22 + 0xFF_FF
/** Enough entries to meet a package's main part; an Office file has a few dozen. */
const MAX_ZIP_NAMES = 2000

/** The folder of each Office Open XML package's main part: what tells a workbook from a deck or a document. */
const OOXML_FOLDERS: readonly (readonly [string, SniffedFormat])[] = [['xl/', 'xlsx'], ['ppt/', 'pptx'], ['word/', 'docx']]

/**
 * The format a body's bytes show, for a body whose content type says nothing
 * useful (`application/octet-stream`, `text/plain`, none): a PDF by `%PDF-`
 * near the start; a zip (`PK 03 04`) by its part names, `xl/` a workbook,
 * `ppt/` a deck, `word/` a Word document; gzip (`1F 8B`) as XML only when the
 * URL names a `.xml.gz` file (a sitemap). Only the zip's directory is read,
 * never a part, so sniffing costs no inflating.
 *
 * @param bytes - The body.
 * @param path - The URL's path or the file's name.
 * @returns The format, or `undefined` when the bytes prove none.
 */
export function sniffFormat (bytes: Uint8Array, path: string): SniffedFormat | undefined {
  if (startsPdf(bytes)) return 'pdf'
  if (bytes.length >= 4 && uint32(bytes, 0) === ZIP_LOCAL_HEADER) {
    const names = zipPartNames(bytes)

    return OOXML_FOLDERS.find(([folder]) => names.some(name => name.startsWith(folder)))?.[1]
  }
  if (bytes[0] === 0x1F && bytes[1] === 0x8B && /\.xml\.gz$/i.test(path)) return 'xml'

  return undefined
}

function startsPdf (bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, PDF_WINDOW) - PDF_SIGNATURE.length
  for (let at = 0; at <= end; at += 1) {
    if (PDF_SIGNATURE.every((byte, index) => bytes[at + index] === byte)) return true
  }

  return false
}

/**
 * The names of a zip's entries, from its central directory, or from its
 * local headers when the directory cannot be found (a truncated body).
 *
 * @param bytes - A zip.
 * @returns The names, as stored.
 */
export function zipPartNames (bytes: Uint8Array): string[] {
  return centralDirectoryNames(bytes) ?? localHeaderNames(bytes)
}

function centralDirectoryNames (bytes: Uint8Array): string[] | undefined {
  const end = endOfDirectory(bytes)
  if (end === undefined) return undefined
  const names: string[] = []
  const count = Math.min(uint16(bytes, end + 10), MAX_ZIP_NAMES)
  let at = uint32(bytes, end + 16)
  for (let entry = 0; entry < count && at + 46 <= bytes.length && uint32(bytes, at) === ZIP_CENTRAL_HEADER; entry += 1) {
    const nameLength = uint16(bytes, at + 28)
    names.push(latin1(bytes.subarray(at + 46, at + 46 + nameLength)))
    at += 46 + nameLength + uint16(bytes, at + 30) + uint16(bytes, at + 32)
  }

  return names.length > 0 ? names : undefined
}

function endOfDirectory (bytes: Uint8Array): number | undefined {
  const last = Math.max(0, bytes.length - ZIP_END_WINDOW)
  for (let at = bytes.length - 22; at >= last; at -= 1) {
    if (uint32(bytes, at) === ZIP_END_OF_DIRECTORY) return at
  }

  return undefined
}

/** Walks the local headers while their sizes are known (bit 3 defers a size to after the data). */
function localHeaderNames (bytes: Uint8Array): string[] {
  const names: string[] = []
  let at = 0
  while (names.length < MAX_ZIP_NAMES && at + 30 <= bytes.length && uint32(bytes, at) === ZIP_LOCAL_HEADER) {
    const nameLength = uint16(bytes, at + 26)
    names.push(latin1(bytes.subarray(at + 30, at + 30 + nameLength)))
    if ((uint16(bytes, at + 6) & 0x08) !== 0) break
    at += 30 + nameLength + uint16(bytes, at + 28) + uint32(bytes, at + 18)
  }

  return names
}

function uint16 (bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
}

function uint32 (bytes: Uint8Array, at: number): number {
  return (uint16(bytes, at) | (uint16(bytes, at + 2) << 16)) >>> 0
}

/** Part names are ASCII in every Office package; a single-byte decoder keeps any other byte one character. */
const NAME_DECODER = new TextDecoder('windows-1252')

function latin1 (bytes: Uint8Array): string {
  return NAME_DECODER.decode(bytes)
}
