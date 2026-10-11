import type { Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { OpenPathView } from '../studio-api'
import { importDocument } from './import-document.use-case'
import { openWorkspace } from './open-workspace.use-case'

/** A recipe is a small JSON file; anything larger is a document that happens to be JSON. */
const MAX_RECIPE_BYTES = 5 * 1024 * 1024

/**
 * Says what a path is, for a link or an IDE menu entry that only knows a
 * path: a folder opens as the workspace; a `.json` file whose `kind` is
 * `input` or `output` is a recipe, opened through its own folder; any other
 * file is a document to start a recipe from.
 *
 * A document is read in place when it is already inside the workspace folder
 * (`workspace`, else the file's own folder), and copied into the folder
 * otherwise, with the same no-overwrite numbering `import-document` uses.
 *
 * @param path - An absolute path to a folder or a file.
 * @param workspace - The folder a document should belong to, when the caller has one (an IDE's workspace folder).
 * @returns What it is and where to open it.
 * @throws Error when the path is relative or does not exist.
 */
export async function openPath (path: string, workspace?: string): Promise<OpenPathView> {
  if (!isAbsolute(path)) throw new Error(`"${path}" is not an absolute path`)
  const info = await statOrNothing(path)
  if (info === undefined) throw new Error(`"${path}" does not exist`)
  if (info.isDirectory()) return { kind: 'folder', folder: path }

  const recipe = info.size <= MAX_RECIPE_BYTES ? await recipeAt(path) : undefined
  if (recipe !== undefined) return { kind: 'recipe', folder: dirname(path), recipeId: recipe.id }

  const folder = workspace ?? dirname(path)
  if (isInside(folder, path)) return { kind: 'document', folder, path, url: pathToFileURL(path).href }
  const copy = await importDocument(folder, basename(path), new Uint8Array(await readFile(path)))

  return { kind: 'document', folder, path: copy.path, url: copy.url }
}

/** The recipe a `.json` file holds, with the id of the input recipe to select (an output recipe selects the first input naming it); `undefined` when the file is not a recipe. */
async function recipeAt (path: string): Promise<{ id?: string } | undefined> {
  if (extname(path).toLowerCase() !== '.json') return undefined
  let content: unknown
  try {
    content = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
  const { kind, id } = (typeof content === 'object' && content !== null ? content : {}) as { kind?: unknown, id?: unknown }
  if (kind === 'input') return { id: typeof id === 'string' ? id : undefined }
  if (kind !== 'output') return undefined
  const listing = await openWorkspace(dirname(path))
  for (const candidate of listing.recipes) {
    const named = candidate.kind === 'input' ? inputNaming(candidate.text, id) : undefined
    if (named !== undefined) return { id: named }
  }

  return {}
}

/** The id of the input recipe whose text names `outputId` as its output, read from the JSON itself so an input that does not validate still counts. */
function inputNaming (text: string, outputId: unknown): string | undefined {
  try {
    const { id, output } = JSON.parse(text) as { id?: unknown, output?: unknown }

    return output === outputId && typeof id === 'string' ? id : undefined
  } catch {
    return undefined
  }
}

async function statOrNothing (path: string): Promise<Stats | undefined> {
  try {
    return await stat(path)
  } catch {
    return undefined
  }
}

function isInside (folder: string, path: string): boolean {
  const from = relative(resolve(folder), resolve(path))

  return from !== '' && !from.startsWith('..') && !isAbsolute(from)
}
