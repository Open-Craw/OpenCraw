import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { stringify } from 'yaml'
import { jsonLinesSink } from '../record-sink'
import type { RecordSink, SinkSummary } from '../record-sink'
import type { OutputRecord } from '../output-mapping'
import type { OutputRecipe } from '../recipe-schema'
import { csvText } from './csv.algorithm'
import { htmlReport } from './html-report.algorithm'
import { outputFormatOf } from './output-format.policy'
import type { OutputFormat } from './output-format.policy'
import { pdfFromHtml } from './pdf-report.client'
import type { PdfBrowserOptions } from './pdf-report.client'
import { tableOf } from './table.mapper'
import { xlsxBytes } from './xlsx.algorithm'

export interface FileSinkOptions {
  /** Keep what the file holds and add to it, with the record key as `_key` (JSON Lines only). */
  append?:  boolean
  /** The browser that prints a PDF. */
  browser?: PdfBrowserOptions
  /** When the report was made, for the HTML and PDF pages; now unless given. */
  now?:     () => Date
}

/** The record as JSON Lines, JSON and YAML write it: its data and where it came from. */
function recordObject (record: OutputRecord): Record<string, unknown> {
  return { ...record.data, _source: record.source }
}

/**
 * A sink that writes the run's records to a file in the format its extension names: `.jsonl` (one JSON object per line, written as they arrive),
 * `.json` (an array of the same objects), `.csv`, `.xlsx` (Excel), `.yml`/`.yaml`, `.html` (a page that looks like Studio) or `.pdf` (that page, printed).
 * Any other extension is an error, raised here, before the crawl starts, not after it.
 *
 * JSON Lines is streamed; the other formats are written when the run closes, since a spreadsheet, a page or a PDF is one whole file. Appending
 * and resuming only make sense for JSON Lines, and ask for it.
 *
 * @param path - The file to write; created with its directories, replaced if it exists (JSON Lines can append).
 * @param options - Append mode, the PDF browser and the clock.
 * @returns The sink.
 * @throws UnsupportedOutputFormatError for an extension that names no format; Error for `append` on a format that cannot.
 */
export function fileSink (path: string, options: FileSinkOptions = {}): RecordSink {
  const format = outputFormatOf(path)
  if (format !== 'jsonl' && options.append === true) throw new Error(`cannot append to "${path}": only JSON Lines (.jsonl) can be added to; other formats are written whole`)
  if (format === 'jsonl') return jsonLinesSink(path, { append: options.append })

  const target = resolve(path)
  const records: OutputRecord[] = []
  let output: OutputRecipe | undefined

  return {
    async open (recipe) {
      output = recipe
      await mkdir(dirname(target), { recursive: true })
    },
    async write (record) {
      records.push(record)
    },
    async close (): Promise<SinkSummary> {
      if (output === undefined) throw new Error('fileSink: close before open')
      await writeFile(target, await contentOf(format, output, records, options))

      return { written: records.length, location: target }
    },
    async has (key) {
      return records.some(record => record.key === key)
    },
  }
}

async function contentOf (format: Exclude<OutputFormat, 'jsonl'>, output: OutputRecipe, records: readonly OutputRecord[], options: FileSinkOptions): Promise<string | Uint8Array> {
  switch (format) {
    case 'json': { return `${JSON.stringify(records.map(record => recordObject(record)), null, 2)}\n` }
    case 'yml': { return stringify(records.map(record => recordObject(record))) }
    case 'csv': { return csvText(tableOf(output, records)) }
    case 'xlsx': { return xlsxBytes(tableOf(output, records), output.id) }
    case 'html': { return htmlReport(tableOf(output, records), reportOptions(output, options)) }
    case 'pdf': { return pdfFromHtml(htmlReport(tableOf(output, records), reportOptions(output, options)), options.browser) }
  }
}

function reportOptions (output: OutputRecipe, options: FileSinkOptions): { title: string, description?: string, generatedAt: Date } {
  return { title: output.id, ...(output.description !== undefined && { description: output.description }), generatedAt: (options.now ?? (() => new Date()))() }
}
