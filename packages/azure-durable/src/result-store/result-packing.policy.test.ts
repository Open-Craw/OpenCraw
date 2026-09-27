import type { OutputRecord } from '@opencraw/core'
import { packRecords } from './result-packing.policy'
import type { ResultStore } from './result-store.contract'

const records: OutputRecord[] = Array.from({ length: 20 }, (_, index) => ({ key: String(index), data: { name: `row ${index}` }, source: { recipeId: 'r', url: 'u', emittedAt: 't' } }))

describe('packRecords', () => {
  it('returns small results inline, and saves large ones, returning their link', async () => {
    const saved: string[] = []
    const store: ResultStore = {
      save: async (name) => {
        saved.push(name)

        return `https://store/${name}`
      },
    }
    await expect(packRecords(records.slice(0, 1), { store, inlineLimitBytes: 1024, name: 'a.jsonl' })).resolves.toEqual({ records: records.slice(0, 1) })
    await expect(packRecords(records, { store, inlineLimitBytes: 1024, name: 'b.jsonl' })).resolves.toEqual({ resultUrl: 'https://store/b.jsonl' })
    expect(saved).toEqual(['b.jsonl'])
  })

  it('returns everything inline when there is no store', async () => {
    await expect(packRecords(records, { inlineLimitBytes: 10, name: 'c.jsonl' })).resolves.toEqual({ records })
  })
})
