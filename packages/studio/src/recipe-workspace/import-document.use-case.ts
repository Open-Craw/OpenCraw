import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** How many `name-2.ext`, `name-3.ext`… are tried before giving up on a folder full of same-named copies. */
const MAX_NUMBERED_COPIES = 100

export interface ImportedDocument {
  /** The copy's path on disk, inside `folder`. */
  path: string
  /** The copy as a `file:` URL: what the recipe's `start.url` becomes. */
  url:  string
}

/**
 * Copies a document into a workspace folder, so a recipe can read it with a
 * `file:` URL the same way a run would read any downloaded file (core's
 * `HttpClient` handles `file:` itself). The folder is created when missing,
 * so dropping a file is also a way to start a workspace. A name already in
 * the folder is never overwritten: the copy gets the next free numbered
 * name (`report-2.pdf`), and the returned `path`/`url` say which.
 *
 * @param folder - The workspace folder; created (recursively) when it does not exist.
 * @param name - The file's own name, no directories: the copy keeps it, extension included.
 * @param bytes - The file's content.
 * @returns Where the copy landed.
 * @throws Error when `name` is not a plain file name, or the folder already holds too many same-named copies.
 */
export async function importDocument (folder: string, name: string, bytes: Uint8Array): Promise<ImportedDocument> {
  assertPlainName(name)
  await mkdir(folder, { recursive: true })
  for (const candidate of candidateNames(name)) {
    const path = join(folder, candidate)
    try {
      await writeFile(path, bytes, { flag: 'wx' })

      return { path, url: pathToFileURL(path).href }
    } catch (error) {
      if (!isAlreadyThere(error)) throw error
    }
  }
  throw new Error(`"${name}" and ${MAX_NUMBERED_COPIES} numbered copies of it are already in ${folder}`)
}

function assertPlainName (name: string): void {
  if (name === '.' || name === '..' || name.includes('\0') || name !== basename(name)) {
    throw new Error(`"${name}" is not a plain file name`)
  }
}

function * candidateNames (name: string): Generator<string> {
  yield name
  const extension = extname(name)
  const stem = name.slice(0, name.length - extension.length)
  for (let copy = 2; copy <= MAX_NUMBERED_COPIES + 1; copy += 1) yield `${stem}-${copy}${extension}`
}

function isAlreadyThere (error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}
