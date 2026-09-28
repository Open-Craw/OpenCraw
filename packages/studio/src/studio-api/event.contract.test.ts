import { studioEventSchema } from './event.contract'

describe('studioEventSchema', () => {
  it.each([
    { type: 'trace-line', line: '■ books: 20 emitted, 0 rejected' },
    { type: 'record', recipeId: 'books', key: 'book-1', data: { title: 'A Light in the Attic' } },
    { type: 'record', recipeId: 'books', key: null, data: {} },
    { type: 'run-finished', recipeId: 'books', emitted: 20, rejected: 0, duplicates: 0, durationMs: 340 },
    { type: 'run-finished', recipeId: 'books', emitted: 5, rejected: 0, duplicates: 0, durationMs: 12, stoppedBy: 'sample-maxRecords' },
    { type: 'workspace-changed' },
  ])('accepts a valid %j', (event) => {
    expect(studioEventSchema.safeParse(event).success).toBe(true)
  })

  it('rejects an unknown stoppedBy', () => {
    const event = { type: 'run-finished', recipeId: 'books', emitted: 0, rejected: 0, duplicates: 0, durationMs: 0, stoppedBy: 'timeout' }
    expect(studioEventSchema.safeParse(event).success).toBe(false)
  })
})
