import { rename, rm, writeFile } from 'node:fs/promises'

/**
 * Writes a recipe back to its file: pretty JSON, a 2-space indent, a
 * trailing newline. Phase 0 takes the JSON tab's whole parsed object rather
 * than a patch, so this is a full replacement, not a splice: loading a file
 * the studio has not touched and saving it again keeps every key, value and
 * key order (`JSON.parse` preserves insertion order, and `JSON.stringify`
 * writes it back), but not necessarily the file's exact original formatting
 * (alignment, how arrays wrap, a trailing comment). Byte-identical
 * round-trip for a hand-formatted file is future work; see this file's test
 * for what is guaranteed today.
 *
 * The text goes to a sibling temporary file that is then renamed over the
 * recipe, so a reader (or a crash) never sees a half-written file. Windows
 * refuses a rename over a file another process has open (`EPERM`, `EBUSY`),
 * so the rename is retried briefly and then gives way to a plain write.
 *
 * @param path - The recipe file to write.
 * @param recipe - The whole recipe object.
 */
export async function saveRecipe (path: string, recipe: unknown): Promise<void> {
  const temporary = `${path}.${String(process.pid)}.tmp`
  const text = `${JSON.stringify(recipe, null, 2)}\n`
  await writeFile(temporary, text, 'utf8')
  try {
    await renameWithRetry(temporary, path)
  } catch {
    await writeFile(path, text, 'utf8')
  } finally {
    await rm(temporary, { force: true })
  }
}

const RENAME_ATTEMPTS = 5
const RENAME_PAUSE_MS = 20

async function renameWithRetry (from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to)

      return
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS) throw error
      await new Promise(resolve => setTimeout(resolve, RENAME_PAUSE_MS))
    }
  }
}
