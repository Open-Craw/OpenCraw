import { strFromU8 } from 'fflate'

/** A zip entry, located once so it can be inflated without reading the directory again. */
export interface ZipEntry {
  /** The name as stored. */
  name:         string
  /** 0 stored, 8 deflated. */
  method:       number
  /** Where its data starts, past its local header. */
  start:        number
  /** Its compressed size. */
  size:         number
  /** The size it declares once inflated. */
  originalSize: number
}

const END_OF_DIRECTORY = 0x06_05_4B_50
const ZIP64_LOCATOR = 0x07_06_4B_50
const ZIP64_END_OF_DIRECTORY = 0x06_06_4B_50
const DIRECTORY_ENTRY = 0x02_01_4B_50
const LOCAL_HEADER = 0x04_03_4B_50
const MAX_COMMENT = 65_535
const SATURATED = 0xFF_FF_FF_FF
const UTF8_FLAG = 0x08_00

/**
 * Reads a zip's central directory once: every entry's name, compression,
 * sizes and where its data starts. Zip64 archives are read too.
 *
 * @param bytes - The zip.
 * @returns The entries, in directory order.
 * @throws Error when the bytes are not a zip or its directory is damaged.
 */
export function readZipDirectory (bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = endOfDirectory(view)
  let count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR) {
    const zip64 = Number(view.getBigUint64(end - 12, true))
    if (view.getUint32(zip64, true) === ZIP64_END_OF_DIRECTORY) {
      count = Number(view.getBigUint64(zip64 + 32, true))
      offset = Number(view.getBigUint64(zip64 + 48, true))
    }
  }
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== DIRECTORY_ENTRY) throw new Error('invalid zip data: a damaged central directory')
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength), (view.getUint16(offset + 8, true) & UTF8_FLAG) === 0)
    const sizes = zip64Sizes(view, offset + 46 + nameLength, extraLength, {
      size:         view.getUint32(offset + 20, true),
      originalSize: view.getUint32(offset + 24, true),
      local:        view.getUint32(offset + 42, true),
    })
    if (view.getUint32(sizes.local, true) !== LOCAL_HEADER) throw new Error(`invalid zip data: ${name} has no local header`)
    const start = sizes.local + 30 + view.getUint16(sizes.local + 26, true) + view.getUint16(sizes.local + 28, true)
    entries.push({ name, method: view.getUint16(offset + 10, true), start, size: sizes.size, originalSize: sizes.originalSize })
    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** The end-of-directory record, searched back from the end past a comment of up to 64 KiB. */
function endOfDirectory (view: DataView): number {
  const last = Math.max(0, view.byteLength - 22 - MAX_COMMENT)
  for (let at = view.byteLength - 22; at >= last; at -= 1) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY) return at
  }
  throw new Error('invalid zip data: no end of central directory')
}

/** The sizes and offset a zip64 extra field holds for the ones the entry saturates. */
function zip64Sizes (view: DataView, extra: number, length: number, sizes: { size: number, originalSize: number, local: number }): { size: number, originalSize: number, local: number } {
  if (sizes.size !== SATURATED && sizes.originalSize !== SATURATED && sizes.local !== SATURATED) return sizes
  for (let at = extra; at + 4 <= extra + length; at += 4 + view.getUint16(at + 2, true)) {
    if (view.getUint16(at, true) !== 1) continue
    let field = at + 4
    const next = (): number => {
      const value = Number(view.getBigUint64(field, true))
      field += 8

      return value
    }
    const originalSize = sizes.originalSize === SATURATED ? next() : sizes.originalSize
    const size = sizes.size === SATURATED ? next() : sizes.size

    return { size, originalSize, local: sizes.local === SATURATED ? next() : sizes.local }
  }

  return sizes
}
