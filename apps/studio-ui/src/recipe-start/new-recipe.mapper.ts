/** An id is lowercase letters, digits and hyphens, not starting with a hyphen — `@opencraw/core`'s own `input`/`output` recipe id pattern. */
export const RECIPE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** Where a new recipe starts until its author points it at the real site. */
export const DEFAULT_START_URL = 'https://example.com'

/**
 * Why `text` cannot be a start URL, or `undefined` when it can: an absolute
 * `http`/`https` address. Blank is fine (the default applies).
 */
export function startUrlError (text: string): string | undefined {
  if (text.trim() === '') return undefined
  try {
    const { protocol } = new URL(text.trim())

    return protocol === 'http:' || protocol === 'https:' ? undefined : 'use an http:// or https:// address'
  } catch {
    return 'use a full address, like https://example.com/books'
  }
}

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
 * @param id - The recipe id: also names both files, `<id>.ocw-in.json` and `<id>.ocw-out.json`.
 * @param startUrl - The page the recipe starts on (issue #151); `https://example.com` when not given.
 */
export function newRecipeFiles (folder: string, id: string, startUrl = DEFAULT_START_URL): NewRecipeFiles {
  return recipeFiles(folder, id, {
    mode:  'web',
    start: [{ url: startUrl }],
    steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'emit' }],
  })
}

/**
 * The pair for a recipe that starts from the address of a document ("Load ▾ Web page" on an address that returns JSON, a PDF, a CSV, a
 * spreadsheet, Markdown...): an `api` recipe whose one `request` step reads the response as that kind, whatever content type it is
 * served as. The content pane then shows the document's own view to pick from.
 *
 * @param folder - The open workspace folder (a trailing slash is tolerated).
 * @param id - The recipe id.
 * @param url - The address.
 * @param kind - What it returns (`json`, `pdf`, `csv`, `xlsx`, `markdown`...).
 */
export function documentUrlRecipeFiles (folder: string, id: string, url: string, kind: string): NewRecipeFiles {
  return recipeFiles(folder, id, {
    mode:  'api',
    start: [{ url }],
    steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: kind }],
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
    outputPath: `${base}/${id}.ocw-out.json`,
    output:     { kind: 'output', id, version: 1, fields: {} },
    inputPath:  `${base}/${id}.ocw-in.json`,
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

/** Labels of an address's host that say nothing about the site: `www`, a language, and the endings every site has. */
const HOST_NOISE = new Set(['www', 'en', 'uk', 'com', 'co', 'org', 'net', 'gov', 'edu', 'io', 'eu', 'us', 'de', 'fr', 'es', 'it', 'nl', 'info', 'app', 'dev'])

/**
 * A recipe id read off a page address: the site, then what is at the end of the path (`https://www.legislation.gov.uk/ukpga/2019/4/section/1`
 * is `legislation-section-1`, `https://quotes.toscrape.com/` is `quotes-toscrape`, a PDF's address is named after the file). Two pages of one
 * site get different names, and the name says something about the page.
 *
 * @param address - The page or document address.
 * @returns The id; `document` when the address has nothing to name it by.
 */
export function recipeIdFromAddress (address: string): string {
  let parsed: URL
  try {
    parsed = new URL(address)
  } catch {
    return 'document'
  }
  const site = parsed.hostname.split('.').filter(label => !HOST_NOISE.has(label)).slice(0, 2)
  const segments = parsed.pathname.split('/').filter(segment => segment !== '').map(segment => segment.replace(/\.[^.]+$/, ''))
  // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
  const last = segments.length === 0 ? undefined : segments[segments.length - 1]
  // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
  const before = segments.length < 2 ? undefined : segments[segments.length - 2]
  const tail = last === undefined ? [] : (before !== undefined && /^\d+$/.test(last) ? [before, last] : [last])
  const id = recipeIdFromFileName([...site, ...tail].join(' ')).slice(0, 48).replace(/-$/, '')

  return id
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
