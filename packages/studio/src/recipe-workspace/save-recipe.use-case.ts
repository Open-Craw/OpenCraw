import { writeFile } from 'node:fs/promises'

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
 * @param path - The recipe file to write.
 * @param recipe - The whole recipe object.
 */
export async function saveRecipe (path: string, recipe: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(recipe, null, 2)}\n`, 'utf8')
}
