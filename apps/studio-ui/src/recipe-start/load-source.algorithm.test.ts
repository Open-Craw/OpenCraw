import { planLoad } from './load-source.algorithm'

const webRecipe = { kind: 'input', id: 'books', output: 'books', mode: 'web', start: [{ url: 'https://old.test/' }], steps: [{ type: 'goto', url: '{{start.url}}' }], mapping: { title: { from: 'title' } } }
const documentRecipe = { kind: 'input', id: 'q3', output: 'q3', mode: 'api', start: [{ url: 'file:///r/q3.pdf' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }], mapping: {} }

describe('planLoad', () => {
  it('replaces only the start address of a web recipe when a page is loaded', () => {
    const plan = planLoad(webRecipe, { kind: 'url', url: 'https://new.test/' })
    expect(plan).toEqual({ kind: 'replace', recipe: { ...webRecipe, start: [{ url: 'https://new.test/' }] }, previous: 'https://old.test/' })
  })

  it('replaces the start address of a document recipe when a document is loaded', () => {
    const plan = planLoad(documentRecipe, { kind: 'document', url: 'file:///r/q4.pdf' })
    expect(plan).toMatchObject({ kind: 'replace', previous: 'file:///r/q3.pdf', recipe: { start: [{ url: 'file:///r/q4.pdf' }], mapping: {} } })
  })

  it('starts a new recipe when the source is of the other kind', () => {
    expect(planLoad(webRecipe, { kind: 'document', url: 'file:///r/q4.pdf' })).toEqual({ kind: 'new' })
    expect(planLoad(documentRecipe, { kind: 'url', url: 'https://new.test/' })).toEqual({ kind: 'new' })
  })

  it('starts a new recipe when none is open, or it is not an input recipe with a start', () => {
    expect(planLoad(undefined, { kind: 'url', url: 'https://new.test/' })).toEqual({ kind: 'new' })
    expect(planLoad({ kind: 'output', id: 'books' }, { kind: 'url', url: 'https://new.test/' })).toEqual({ kind: 'new' })
    expect(planLoad({ ...webRecipe, start: [] }, { kind: 'url', url: 'https://new.test/' })).toEqual({ kind: 'new' })
  })
})
