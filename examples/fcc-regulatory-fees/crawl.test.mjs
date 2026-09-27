// npm test: the shipped copy of the document, read offline.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { crawl } from './crawl.mjs'

it('reads the radio fee table, each cell split into its payment type code and fee', async () => {
  const report = await crawl({ log: () => {} })
  assert.equal(report.records, 9)
  assert.equal(report.recipes[0].rejected, 0)
  const [{ _source, ...first }] = readFileSync(report.sink.location, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(first, { populationServed: '<=10,000', amClassA: { paymentTypeCode: '2659', feeUsd: 560 }, amClassB: { paymentTypeCode: '2660', feeUsd: 405 }, amClassC: { paymentTypeCode: '2661', feeUsd: 350 }, amClassD: { paymentTypeCode: '2662', feeUsd: 385 }, fmClassesA: { paymentTypeCode: '2663', feeUsd: 615 }, fmClassesB: { paymentTypeCode: '2664', feeUsd: 700 } })
})
