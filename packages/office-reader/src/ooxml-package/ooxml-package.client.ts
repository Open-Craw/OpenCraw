import { inflateSync, strFromU8 } from 'fflate'
import { OfficeReadError } from '../read-error'
import { readZipDirectory } from './zip-directory.algorithm'
import type { ZipEntry } from './zip-directory.algorithm'

/**
 * How much a package may inflate to. Each entry inflates into a buffer of the
 * size its zip header declares, never past it: a header that lies about a
 * bomb gets a truncated entry, not gigabytes. Capping the declared sizes is
 * therefore enough.
 */
export interface PackageLimits {
  /** Bytes one entry may declare. Default 256 MiB. */
  entryBytes?: number
  /** Bytes the entries read from one file may declare together, each counted once. Default 512 MiB. */
  totalBytes?: number
}

const MIB = 1024 * 1024
const DEFAULT_ENTRY_BYTES = 256 * MIB
const DEFAULT_TOTAL_BYTES = 512 * MIB

/** An Office Open XML package: a zip of XML parts, read part by part. */
export class OoxmlPackage {
  /**
   * Opens a package, refusing what is not one with the reason: a legacy or
   * password-protected Office file (both are OLE compound files), an
   * OpenDocument file, anything else that is not a zip.
   *
   * @param bytes - The file.
   * @param limits - How much it may inflate to.
   * @returns The package; no part is inflated yet.
   * @throws OfficeReadError
   */
  static open (bytes: Uint8Array, limits: PackageLimits = {}): OoxmlPackage {
    if (isCompoundFile(bytes)) {
      if (holdsEncryptionInfo(bytes)) throw new OfficeReadError('encrypted', 'a password-protected Office file: remove the password and save it again')
      throw new OfficeReadError('legacy-format', 'a legacy binary Office file (.xls, .ppt, .doc): save it as .xlsx, .pptx or .docx, or export it as PDF')
    }
    const entries = new Map<string, ZipEntry>()
    try {
      for (const entry of readZipDirectory(bytes)) entries.set(partKey(entry.name), entry)
    } catch (error) {
      throw new OfficeReadError('not-zip', `not an Office file: not a readable zip (${(error as Error).message})`, { cause: error })
    }
    const opened = new OoxmlPackage(bytes, entries, { entryBytes: limits.entryBytes ?? DEFAULT_ENTRY_BYTES, totalBytes: limits.totalBytes ?? DEFAULT_TOTAL_BYTES })
    const mimetype = opened.has('mimetype') ? opened.text('mimetype').trim() : ''
    if (mimetype.startsWith('application/vnd.oasis.opendocument')) throw new OfficeReadError('unsupported-format', `an OpenDocument file (${mimetype}): save it as .xlsx, .pptx or .docx`)

    return opened
  }

  private declared = 0
  /** The parts counted against the total limit: a part read twice counts once. */
  private readonly counted = new Set<string>()

  /**
   * Entries by part key: part names are case-insensitive (OPC), and some
   * generators store `xl\\sharedstrings.xml` for `xl/sharedStrings.xml`.
   * Each entry is located when the package opens, so reading a part never
   * walks the zip's directory again.
   */
  private constructor (private readonly bytes: Uint8Array, private readonly entries: ReadonlyMap<string, ZipEntry>, private readonly limits: Required<PackageLimits>) {}

  /** The names of every part, as stored. */
  get names (): string[] {
    return Array.from(this.entries.values(), entry => entry.name)
  }

  has (name: string): boolean {
    return this.entries.has(partKey(name))
  }

  /**
   * Inflates one part as UTF-8 text.
   *
   * @param name - The part, as stored (`xl/workbook.xml`).
   * @returns The text; empty when the part is missing.
   * @throws OfficeReadError: `too-large` past the limits, `malformed` when the part does not inflate.
   */
  text (name: string): string {
    const key = partKey(name)
    const entry = this.entries.get(key)
    if (entry === undefined) return ''
    if (entry.originalSize > this.limits.entryBytes) throw new OfficeReadError('too-large', `${name} declares ${entry.originalSize} bytes, over the ${this.limits.entryBytes}-byte entry limit`)
    if (!this.counted.has(key)) {
      if (this.declared + entry.originalSize > this.limits.totalBytes) throw new OfficeReadError('too-large', `the parts read declare over ${this.limits.totalBytes} bytes together`)
      this.counted.add(key)
      this.declared += entry.originalSize
    }

    return strFromU8(inflate(this.bytes, name, entry))
  }
}

/** A part's bytes: stored as they are, or deflated into a buffer of the size it declares, never past it. */
function inflate (bytes: Uint8Array, name: string, entry: ZipEntry): Uint8Array {
  const data = bytes.subarray(entry.start, entry.start + entry.size)
  if (entry.method === 0) return data
  if (entry.method !== 8) throw new OfficeReadError('malformed', `${name} uses compression method ${entry.method}, which Office files do not use: the file is damaged`)
  try {
    return inflateSync(data, { out: new Uint8Array(entry.originalSize) })
  } catch (error) {
    throw new OfficeReadError('malformed', `${name} does not inflate (${(error as Error).message}): the file is damaged`, { cause: error })
  }
}

/** How a part is looked up: forward slashes, no leading slash, lower case. */
function partKey (name: string): string {
  return name.replaceAll('\\', '/').replace(/^\//, '').toLowerCase()
}

/** An OLE compound file (`D0 CF 11 E0 A1 B1 1A E1`): a legacy Office file, or an encrypted new one. */
function isCompoundFile (bytes: Uint8Array): boolean {
  const signature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]

  return signature.every((byte, index) => bytes[index] === byte)
}

/** Whether a compound file holds an `EncryptionInfo` stream: an encrypted .xlsx/.pptx, not a legacy file. */
function holdsEncryptionInfo (bytes: Uint8Array): boolean {
  const name = [...'EncryptionInfo'].flatMap(char => [char.codePointAt(0) ?? 0, 0])
  const last = bytes.length - name.length
  for (let start = 0; start <= last; start += 1) {
    if (name.every((byte, index) => bytes[start + index] === byte)) return true
  }

  return false
}
