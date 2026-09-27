// npm test: the shipped copy of the document, read offline.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { crawl } from './crawl.mjs'

it('reads the table on the Student Numbers slide, numbers parsed', async () => {
  const report = await crawl({ log: () => {} })
  assert.equal(report.records, 7)
  assert.equal(report.recipes[0].rejected, 0)
  const [{ _source, ...first }] = readFileSync(report.sink.location, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(first, { programme: '16-19 students', lastYearActual: 2820, currentActual: 2780, budget: 2710, forecast: 2790, rag: 'Green', implications: 'Increase in lagged funding in 202X/2Y of circa £350,000', slide: 6 })
})
