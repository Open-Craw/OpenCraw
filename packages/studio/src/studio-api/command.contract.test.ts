import { studioCommandSchema } from './command.contract'

describe('studioCommandSchema', () => {
  it.each([
    { type: 'open-workspace', folder: '/tmp/recipes' },
    { type: 'run-sample', recipeId: 'books', budget: { maxRecords: 5 } },
    { type: 'run-sample', recipeId: 'books' },
    { type: 'stop-run' },
    { type: 'save-recipe', path: '/tmp/recipes/books.input.json', recipe: { kind: 'input' } },
    { type: 'fetch-start-page', recipeId: 'books' },
    { type: 'save-outline', path: '/tmp/recipes/books.input.json', outline: { recipe: {}, steps: [] } },
    { type: 'take-snapshot', recipeId: 'books', path: 'start' },
    { type: 'verify-selector', recipeId: 'books', path: 'start', selector: '.price_color' },
    { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: ['n5'] },
    { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: ['n5', 'n12'] },
    { type: 'explain-why', target: { kind: 'missing', recipeId: 'books', recordIndex: 0, field: 'price' } },
    { type: 'explain-why', target: { kind: 'rejected', recipeId: 'books', rejectedIndex: 0 } },
  ])('accepts a valid %j', (command) => {
    expect(studioCommandSchema.safeParse(command).success).toBe(true)
  })

  it('rejects an unknown command type', () => {
    expect(studioCommandSchema.safeParse({ type: 'delete-everything' }).success).toBe(false)
  })

  it('rejects run-sample without a recipeId', () => {
    expect(studioCommandSchema.safeParse({ type: 'run-sample' }).success).toBe(false)
  })

  it('rejects open-workspace with an empty folder', () => {
    expect(studioCommandSchema.safeParse({ type: 'open-workspace', folder: '' }).success).toBe(false)
  })
})
