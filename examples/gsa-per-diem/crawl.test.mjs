// npm test: the shipped copy of the document, read offline.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { crawl } from './crawl.mjs'

it('reads every rate from the Master sheet, and rejects the standard-rate row that has no state', async () => {
  const report = await crawl({ log: () => {} })
  assert.equal(report.records, 649)
  assert.equal(report.recipes[0].rejected, 1)
  const [{ _source, ...first }] = readFileSync(report.sink.location, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(first, { state: 'AL', destination: 'Birmingham', counties: 'Jefferson', seasonBegin: 'all year', seasonEnd: null, lodgingUsd: 126, mealsUsd: 80 })
})
