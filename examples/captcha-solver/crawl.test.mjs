// npm test (with capsolver.test.mjs): the local demo, end to end. Needs a browser (`npm run setup`).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { crawl } from './crawl.mjs'

describe('the local captcha demo', { timeout: 120_000 }, () => {
  it('solves the challenge through the fake API, then reads the results behind it', async () => {
    const { report, tasks } = await crawl({ log: () => {} })
    assert.deepEqual(report.recipes[0].captchas, { detected: 1, solved: 1, failed: 0 })
    assert.deepEqual(tasks, [{ type: 'ReCaptchaV2TaskProxyLess', websiteURL: 'http://127.0.0.1:4581/search?q=rain', websiteKey: 'demo-site-key' }])
    const records = readFileSync(report.sink.location, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(records.map(({ query, name, price }) => ({ query, name, price })), [
      { query: 'rain', name: 'Trail runner', price: 40 },
      { query: 'rain', name: 'Rain shell', price: 55.5 },
      { query: 'rain', name: 'Wool beanie', price: 70 },
    ])
  })
})
