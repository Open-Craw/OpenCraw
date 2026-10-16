import { extname } from 'node:path'

/** One format the person can save a run in, as the save dialog offers it. */
export interface SaveChoice {
  label:     string
  extension: string
}

/** Every format the engine writes, best first for a person who wants to open the result: a spreadsheet, a page, a PDF, then the data formats. */
export const SAVE_CHOICES: readonly SaveChoice[] = [
  { label: 'Excel workbook', extension: 'xlsx' },
  { label: 'CSV', extension: 'csv' },
  { label: 'Web page (HTML)', extension: 'html' },
  { label: 'PDF', extension: 'pdf' },
  { label: 'JSON', extension: 'json' },
  { label: 'JSON Lines', extension: 'jsonl' },
  { label: 'YAML', extension: 'yml' },
]

const EXTENSIONS = new Set([...SAVE_CHOICES.map(choice => `.${choice.extension}`), '.yaml'])

/** The filters of the operating system's save dialog: one per format. */
export function saveFilters (): Record<string, string[]> {
  return Object.fromEntries(SAVE_CHOICES.map(choice => [`${choice.label} (.${choice.extension})`, [choice.extension]]))
}

/** The file name the dialog starts with: the output's id in the first format offered. */
export function defaultFileName (outputId: string): string {
  return `${outputId}.${SAVE_CHOICES[0].extension}`
}

/**
 * Checks the file the person named: its extension is the format, so it has to be one the engine writes.
 *
 * @param path - What the save dialog returned.
 * @returns `undefined` when the name is fine, else what to tell the person.
 */
export function saveNameProblem (path: string): string | undefined {
  const extension = extname(path).toLowerCase()
  if (EXTENSIONS.has(extension)) return undefined
  const shown = extension === '' ? 'has no extension' : `ends in "${extension}"`
  const choices = SAVE_CHOICES.map(choice => `.${choice.extension}`).join(', ')

  return `"${path}" ${shown}. The extension is the format: name the file ${choices} (or .yaml).`
}
