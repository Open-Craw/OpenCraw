import { sampleRunViewSchema } from './sample-run-view.contract'

describe('sampleRunViewSchema', () => {
  it('accepts a finished run', () => {
    const view = {
      recipeId:   'books',
      emitted:    2,
      rejected:   0,
      duplicates: 0,
      durationMs: 120,
      stoppedBy:  'sample-maxRecords',
      records:    [{ key: 'book-1', data: { title: 'A' } }, { key: null, data: { title: 'B' } }],
      trace:      ['■ books: 2 emitted, 0 rejected'],
    }
    expect(sampleRunViewSchema.safeParse(view).success).toBe(true)
  })

  it('rejects a run missing its emitted count', () => {
    const view = { recipeId: 'books', rejected: 0, duplicates: 0, durationMs: 0, records: [], trace: [] }
    expect(sampleRunViewSchema.safeParse(view).success).toBe(false)
  })
})
