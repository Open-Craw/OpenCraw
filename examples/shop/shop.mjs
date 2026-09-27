// Starts the shop, crawls it with the web recipe, the api recipe or both, and stops it again.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@opencraw/core'
import { startShop } from './site.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const INPUTS = { web: 'shop-web.input.json', api: 'shop-api.input.json' }

/**
 * @param {object} [options] - What to run and where to report.
 * @param {'web' | 'api'} [options.only] - One recipe; both when unset.
 * @param {boolean} [options.trace] - Print the route the engine takes.
 * @param {(line: string) => void} [options.log] - Where lines go; `console.log` by default.
 * @returns {Promise<import('@opencraw/core').CrawlReport>} The run's report.
 */
export async function crawlShop ({ only, trace = false, log = console.log } = {}) {
  const shop = await startShop()
  const inputs = Object.entries(INPUTS).filter(([name]) => only === undefined || only === name).map(([, file]) => join(here, file))
  const recipes = await loadRecipeSet({ output: join(here, 'product.output.json'), inputs })
  const crawler = createCrawler({
    // The api recipe's mapping calls it: a stock count becomes "in stock" when it is above zero.
    hooks:   { positive: input => Number(input) > 0 },
    sink:    jsonLinesSink(join(here, 'out', 'products.jsonl')),
    browser: { executablePath: process.env.OPENCRAW_CHROMIUM || undefined },
    onEvent: (event) => {
      const line = trace ? traceLine(event) : undefined
      if (line !== undefined) log(line)
      if (event.type === 'record:emit') log(`${event.recipeId.padEnd(9)} | ${event.data.title.padEnd(13)} | ${String(event.data.price.amount).padStart(6)} ${event.data.price.currency} | ${event.data.inStock ? 'in stock' : 'sold out'}`)
      if (['record:reject', 'error'].includes(event.type)) log(`[${event.type}] ${event.recipeId}: ${event.reason ?? event.error ?? event.message}`)
    },
  })
  try {
    return await crawler.run(recipes)
  } finally {
    await crawler.close()
    await shop.close()
  }
}
