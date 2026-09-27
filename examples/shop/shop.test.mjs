// npm test: crawls the local shop both ways and checks the records. Needs a browser (`npm run setup`).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { crawlShop } from './shop.mjs'

const quiet = () => {}
const records = report => readFileSync(report.sink.location, 'utf8').trim().split('\n').map(line => JSON.parse(line))

describe('the shop example', { timeout: 120_000 }, () => {
  it('reads six products in a browser', async () => {
    const report = await crawlShop({ only: 'web', log: quiet })
    assert.equal(report.records, 6)
    const [first] = records(report)
    assert.equal(first.title, 'Trail runner')
    assert.deepEqual(first.price, { amount: 40, currency: 'EUR' })
    assert.deepEqual(first.variants, [{ size: 'M', price: { amount: 40, currency: 'EUR' } }, { size: 'L', price: { amount: 45.5, currency: 'EUR' } }])
  })

  it('reads the same six through the API after logging in', async () => {
    const report = await crawlShop({ only: 'api', log: quiet })
    assert.equal(report.records, 6)
    assert.deepEqual(records(report).map(record => record.title), ['Trail runner', 'Rain shell', 'Wool beanie', 'Down vest', 'Hiking pole', 'Dry bag'])
  })

  it('keeps one record per product when both recipes run', async () => {
    const report = await crawlShop({ log: quiet })
    assert.equal(report.records, 6)
    assert.deepEqual(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.duplicates]), [['shop-web', 6, 0], ['shop-api', 0, 6]])
  })
})
