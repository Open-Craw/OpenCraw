// Reads the document with the recipe. By default it reads the copy shipped in this folder, so the example runs
// offline; `live: true` fetches the original from the URL in the recipe's `start`.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@opencraw/core'

const here = dirname(fileURLToPath(import.meta.url))
export const DOCUMENT = join(here, 'fy2026-regulatory-fees-media-bureau.docx')

/**
 * @param {object} [options] - How to run.
 * @param {boolean} [options.live] - Fetch the original document instead of reading the shipped copy.
 * @param {boolean} [options.trace] - Print the route the engine takes.
 * @param {(line: string) => void} [options.log] - Where lines go; `console.log` by default.
 * @returns {Promise<import('@opencraw/core').CrawlReport>} The run's report.
 */
export async function crawl ({ live = false, trace = false, log = console.log } = {}) {
  const input = JSON.parse(await readFile(join(here, 'fcc-radio-fees.input.json'), 'utf8'))
  if (!live) input.start = [{ url: pathToFileURL(DOCUMENT).href }]
  const recipes = await loadRecipeSet({ output: join(here, 'radio-station-fee.output.json'), inputs: [input] })
  const crawler = createCrawler({
    sink:    jsonLinesSink(join(here, 'out', 'radio-station-fees.jsonl')),
    browser: { ignoreHTTPSErrors: process.env.OPENCRAW_INSECURE_TLS === '1' },
    onEvent: (event) => {
      const line = trace ? traceLine(event) : undefined
      if (line !== undefined) log(line)
      if (event.type === 'record:emit') log(describe(event.data))
      if (['record:reject', 'error'].includes(event.type)) log(`[${event.type}] ${event.reason ?? event.error ?? event.message}`)
    },
  })
  try {
    return await crawler.run(recipes)
  } finally {
    await crawler.close()
  }
}

/** One line per record. */
function describe (data) {
  return `${data.populationServed.padEnd(22)} | AM A $${data.amClassA.feeUsd} (${data.amClassA.paymentTypeCode}) | FM B $${data.fmClassesB.feeUsd} (${data.fmClassesB.paymentTypeCode})`
}
