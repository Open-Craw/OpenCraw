import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrawlEvent } from '../crawl-events'
import { UnknownHookError } from '../hooks'
import { bindRecipeSet } from '../recipe-loading'
import { parseInputRecipe, parseOutputRecipe } from '../recipe-schema'
import { memorySink } from '../record-sink'
import { createCrawler } from './create-crawler.use-case'

function fixture (name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'recipe-schema', 'fixtures', name), 'utf8'))
}

describe('createCrawler', () => {
  // The api fixture maps inStock through the hook "positive".
  const set = bindRecipeSet(parseOutputRecipe(fixture('product.output.json')), [parseInputRecipe(fixture('shop-api.input.json'))])

  it('fails a run whose recipes name an unregistered hook before its first request (#78)', async () => {
    const events: CrawlEvent[] = []
    const sink = memorySink()
    const crawler = createCrawler({ sink, onEvent: (event) => { events.push(event) }, hooks: { other: () => true } })
    const run = crawler.run(set)
    await expect(run).rejects.toThrow(UnknownHookError)
    await expect(run).rejects.toThrow('shop-api mapping.inStock.transform.1: unknown hook "positive"; registered: other')
    expect(events).toEqual([])
    await crawler.close()
  })
})
