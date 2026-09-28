import { workspaceViewSchema } from './workspace-view.contract'

describe('workspaceViewSchema', () => {
  it('accepts a workspace with clean and problem recipes', () => {
    const view = {
      folder:  '/tmp/recipes',
      recipes: [
        { file: '/tmp/recipes/book.output.json', kind: 'output', id: 'book', issues: [], text: '{}\n' },
        { file: '/tmp/recipes/books.input.json', kind: 'input', id: 'books', issues: [{ path: 'mapping.title', message: 'output "book" has no field "title"', kind: 'binding' }], text: '{}\n' },
        { file: '/tmp/recipes/junk.json', kind: 'unknown', issues: [{ path: 'kind', message: '"kind" is missing or not "input"/"output"', kind: 'validation' }], text: '{}\n' },
      ],
    }
    expect(workspaceViewSchema.safeParse(view).success).toBe(true)
  })

  it('rejects a recipe listing with an unknown kind', () => {
    const view = { folder: '/tmp', recipes: [{ file: 'a.json', kind: 'bogus', issues: [] }] }
    expect(workspaceViewSchema.safeParse(view).success).toBe(false)
  })
})
