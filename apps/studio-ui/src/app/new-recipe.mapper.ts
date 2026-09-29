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
  const base = folder.endsWith('/') ? folder.slice(0, -1) : folder

  return {
    outputPath: `${base}/${id}.output.json`,
    output:     { kind: 'output', id, version: 1, fields: {} },
    inputPath:  `${base}/${id}.input.json`,
    input:      {
      kind:    'input',
      id,
      output:  id,
      mode:    'web',
      start:   [{ url: 'https://example.com' }],
      steps:   [{ type: 'goto', url: '{{start.url}}' }, { type: 'emit' }],
      mapping: {},
    },
  }
}
