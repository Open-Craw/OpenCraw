import { createLastRunCache, lastRunOf, recordLastRun } from './last-run.store'
import type { SampleRunResult } from './sample-run-record.contract'

function resultOf (recipeId: string): SampleRunResult {
  return { recipeId, emitted: 1, rejected: 0, duplicates: 0, durationMs: 1, records: [], rejectedRecords: [], steps: [] }
}

describe('last-run.store', () => {
  it('has nothing for a recipe that has not run yet', () => {
    expect(lastRunOf(createLastRunCache(), 'books')).toBeUndefined()
  })

  it('keeps the most recent run per recipe, replacing an earlier one', () => {
    const cache = createLastRunCache()
    recordLastRun(cache, 'books', resultOf('books'))
    recordLastRun(cache, 'books', { ...resultOf('books'), emitted: 5 })
    recordLastRun(cache, 'quotes', resultOf('quotes'))

    expect(lastRunOf(cache, 'books')?.result.emitted).toBe(5)
    expect(lastRunOf(cache, 'quotes')?.result.emitted).toBe(1)
  })
})
