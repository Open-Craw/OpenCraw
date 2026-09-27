// Runs the example. Without CAPSOLVER_KEY: the local search site and a fake CapSolver API, so the whole solve
// (detect, ask the API, apply the token, check the page) happens offline. With it: the real CapSolver on
// Google's public reCAPTCHA demo page, which is there for testing solvers.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@opencraw/core'
import { capsolver } from './capsolver.mjs'
import { API_KEY, startFakeCapsolver, startSite } from './site.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * @param {object} [options] - How to run.
 * @param {string} [options.apiKey] - A real CapSolver key; the local demo when unset.
 * @param {(line: string) => void} [options.log] - Where the trace goes; `console.log` by default.
 * @returns {Promise<{ report: import('@opencraw/core').CrawlReport, live: boolean, tasks?: object[] }>} The report, and for the demo the tasks the fake API received.
 */
export async function crawl ({ apiKey, log = console.log } = {}) {
  const live = apiKey !== undefined && apiKey !== ''
  const site = live ? undefined : await startSite()
  const api = live ? undefined : await startFakeCapsolver()
  const solver = capsolver(live ? { apiKey } : { apiKey: API_KEY, api: api.url, pollMs: 100 })
  const recipes = live
    ? await loadRecipeSet({ output: join(here, 'recaptcha-demo.output.json'), inputs: [join(here, 'recaptcha-demo.input.json')] })
    : await loadRecipeSet({ output: join(here, 'search-result.output.json'), inputs: [join(here, 'local-search.input.json')] })
  const crawler = createCrawler({
    captchaSolvers: [solver],
    sink:           jsonLinesSink(join(here, 'out', live ? 'recaptcha-demo.jsonl' : 'search-results.jsonl')),
    browser:        { executablePath: process.env.OPENCRAW_CHROMIUM || undefined },
    onEvent:        (event) => {
      const line = traceLine(event)
      if (line !== undefined) log(line)
    },
  })
  try {
    return { report: await crawler.run(recipes), live, tasks: api?.tasks }
  } finally {
    await crawler.close()
    await site?.close()
    await api?.close()
  }
}
