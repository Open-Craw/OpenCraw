import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { resolveRecipeFileUrls } from './recipe-file-urls.mapper'
import type { RecipeDocument } from './recipe-source.contract'
import { parseRecipeText } from './recipe-text.mapper'

const RECIPE_EXTENSIONS = new Set(['.json', '.jsonl'])
/** The file names that mark a recipe: `<id>.ocw-in.json` is an input recipe, `<id>.ocw-out.json` an output recipe. */
const SUFFIX_KINDS: readonly (readonly [string, 'input' | 'output'])[] = [['.ocw-in.json', 'input'], ['.ocw-out.json', 'output']]

/**
 * Reads one recipe file, or the recipe files directly inside a directory. A
 * file holds one recipe, an array of them, or JSON Lines. An input recipe's
 * relative `file:` URLs resolve against the file's folder.
 *
 * A directory without `*.ocw-in.json` or `*.ocw-out.json` files reads every
 * `.json` and `.jsonl` file, and a file that is not a recipe is an error. A
 * directory with any of them reads those as recipes and, of the other JSON
 * files beside them (`package.json`, data), only the ones that are recipes
 * by their `kind`, so the rest is left alone. A file named for a kind must
 * hold that kind.
 *
 * @param location - A file or directory path.
 * @returns The decoded recipes, files sorted by path.
 * @throws When the path does not exist, a file is neither JSON nor JSON Lines
 * (outside a directory with marked files), or a file named `.ocw-in.json` or
 * `.ocw-out.json` holds the other kind.
 */
export async function readRecipeFiles (location: string): Promise<RecipeDocument[]> {
  const absolute = resolve(location)
  const info = await stat(absolute)
  const candidates = info.isDirectory() ? await recipeFilesIn(absolute) : [{ path: absolute, strict: true }]
  const files = await Promise.all(candidates.map(async ({ path, strict }) => {
    const documents = await readDocuments(path, strict)
    assertKindMatchesName(path, documents)

    return documents.map(document => ({ ...document, content: resolveRecipeFileUrls(document.content, dirname(path)) }))
  }))

  return files.flat()
}

/** A file's recipes; a file that is not one, read leniently, is no recipes at all. */
async function readDocuments (path: string, strict: boolean): Promise<RecipeDocument[]> {
  const text = await readFile(path, 'utf8')
  if (strict) return parseRecipeText(text, path)
  try {
    const documents = parseRecipeText(text, path)

    return documents.length > 0 && documents.every(document => isRecipeKind(document.content)) ? documents : []
  } catch {
    return []
  }
}

async function recipeFilesIn (directory: string): Promise<{ path: string, strict: boolean }[]> {
  const entries = await readdir(directory)
  const names = entries.filter(name => RECIPE_EXTENSIONS.has(extname(name))).sort((a, b) => a.localeCompare(b))
  const marked = names.some(name => kindOfName(name) !== undefined)

  return names.map(name => ({ path: join(directory, name), strict: !marked || kindOfName(name) !== undefined }))
}

/** The kind a file name declares (`.ocw-in.json`, `.ocw-out.json`), `undefined` for any other name. */
function kindOfName (name: string): 'input' | 'output' | undefined {
  return SUFFIX_KINDS.find(([suffix]) => name.endsWith(suffix))?.[1]
}

function isRecipeKind (content: unknown): boolean {
  const kind = (content as { kind?: unknown } | null)?.kind

  return kind === 'input' || kind === 'output'
}

function assertKindMatchesName (path: string, documents: readonly RecipeDocument[]): void {
  const declared = kindOfName(path)
  if (declared === undefined) return
  for (const document of documents) {
    const kind = (document.content as { kind?: unknown } | null)?.kind
    if (kind !== declared) throw new Error(`${document.source}: the file name says an ${declared} recipe, but its "kind" is ${JSON.stringify(kind)}`)
  }
}
