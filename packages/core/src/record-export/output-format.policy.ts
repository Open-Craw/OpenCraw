import { extname } from 'node:path'
import { UnsupportedOutputFormatError } from './unsupported-output-format.error'

/** Every format a run's records can be written in, by the extension of the output file. */
export const OUTPUT_FORMATS = ['jsonl', 'json', 'csv', 'xlsx', 'yml', 'html', 'pdf'] as const
export type OutputFormat = typeof OUTPUT_FORMATS[number]

/** Each extension that names a format, in the lower case a path is compared in. */
const EXTENSIONS: Readonly<Record<string, OutputFormat>> = {
  '.jsonl': 'jsonl',
  '.json':  'json',
  '.csv':   'csv',
  '.xlsx':  'xlsx',
  '.yml':   'yml',
  '.yaml':  'yml',
  '.html':  'html',
  '.pdf':   'pdf',
}

/** The extensions a person may give an output file, for messages and file dialogs. */
export const OUTPUT_EXTENSIONS: readonly string[] = Object.keys(EXTENSIONS)

/**
 * The format an output file is written in: its extension decides, the way a person expects of a file name.
 *
 * @param path - The output file's path.
 * @returns The format.
 * @throws UnsupportedOutputFormatError when the extension names no format (or there is none), saying which ones do.
 */
export function outputFormatOf (path: string): OutputFormat {
  const extension = extname(path).toLowerCase()
  const format = EXTENSIONS[extension]
  if (format === undefined) throw new UnsupportedOutputFormatError(path, extension)

  return format
}
