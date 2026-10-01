/** An id is lowercase letters, digits and hyphens, not starting with a hyphen — `@opencraw/core`'s own `input`/`output` recipe id pattern. */
export const RECIPE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export interface NewRecipeFiles {
  outputPath: string
  output:     Record<string, unknown>
  inputPath:  string
  input:      Record<string, unknown>
}

/**
 * Builds the minimal valid input/output recipe pair a "New recipe" action
 * writes into an empty (or any) workspace folder: a `web` recipe with one
 * `goto` + `emit` step and no mapped fields yet, ready to open in the Steps
 * tab and build out from there. Every value here is exactly what
 * `inputRecipeSchema`/`outputRecipeSchema` require at minimum, so both
 * files load back with zero issues.
 *
 * @param folder - The open workspace folder; joined with the file names (a trailing slash is tolerated).
 * @param id - The recipe id: also names both files, `<id>.input.json` and `<id>.output.json`.
 */
export function newRecipeFiles (folder: string, id: string): NewRecipeFiles {
  return recipeFiles(folder, id, {
    mode:  'web',
    start: [{ url: 'https://example.com' }],
    steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'emit' }],
  })
}

/**
 * The pair for a recipe that starts from a document the person dropped on
 * the studio (issue #120): an `api` recipe whose one `request` step reads
 * the copied file by its `file:` URL — the engine's own local-file reading,
 * which picks PDF/spreadsheet/deck/Word/CSV/JSON/YAML/XML/Markdown by the
 * extension. No `emit` yet: the content pane shows the document's canvas
 * right away, and the first pick writes the `extract` card and what follows.
 *
 * @param folder - The open workspace folder (a trailing slash is tolerated).
 * @param id - The recipe id, usually {@link recipeIdFromFileName}'s.
 * @param url - The copied document's `file:` URL, as `import-document` answered it.
 */
export function documentRecipeFiles (folder: string, id: string, url: string): NewRecipeFiles {
  return recipeFiles(folder, id, {
    mode:  'api',
    start: [{ url }],
    steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }],
  })
}

function recipeFiles (folder: string, id: string, body: Record<string, unknown>): NewRecipeFiles {
  const base = folder.endsWith('/') ? folder.slice(0, -1) : folder

  return {
    outputPath: `${base}/${id}.output.json`,
    output:     { kind: 'output', id, version: 1, fields: {} },
    inputPath:  `${base}/${id}.input.json`,
    input:      { kind: 'input', id, output: id, ...body, mapping: {} },
  }
}

/**
 * A recipe id read off a dropped file's name: the name without its
 * extension, lowercased, every run of anything but a letter or digit
 * folded into one hyphen (`Q3 Report (final).pdf` → `q3-report-final`).
 * Falls back to `document` for a name with nothing usable in it.
 *
 * @param fileName - The file's own name (`File.name`), extension included.
 */
export function recipeIdFromFileName (fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const id = stem.toLowerCase().split(/[^a-z0-9]+/).filter(word => word !== '').join('-')

  return id === '' ? 'document' : id
}

/**
 * `id`, or the first of `id-2`, `id-3`… not already taken: a second drop of
 * `report.pdf` into a folder that has a `report` recipe gets `report-2`,
 * never a silent overwrite of the first one's files.
 *
 * @param id - The wanted id.
 * @param taken - Every recipe id already in the workspace.
 */
export function uniqueRecipeId (id: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(id)) return id
  for (let copy = 2; ; copy += 1) {
    if (!used.has(`${id}-${copy}`)) return `${id}-${copy}`
  }
}
