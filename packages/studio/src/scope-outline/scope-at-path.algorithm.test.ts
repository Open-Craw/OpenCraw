import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scopeAtPath } from './scope-at-path.algorithm'

function fixture (): unknown {
  const root = join(__dirname, '..', '..', '..', '..')

  return JSON.parse(readFileSync(join(root, 'docs', 'how-it-works', 'recipes', 'scope-chain', 'books-tag.input.json'), 'utf8'))
}

describe('scopeAtPath', () => {
  // docs/how-it-works/05-templates-and-scope.md walks this exact recipe's scope chain; the loader's own
  // bindingsAt (packages/core/src/recipe-loading/recipe-binding.validator.test.ts) agrees with these too.
  const scopeChain = fixture()

  it('agrees with the loader: only the built-ins at the first top-level step', () => {
    expect(scopeAtPath(scopeChain, 'steps.0')).toEqual(['page', 'start', 'vars'])
  })

  it('agrees with the loader: the built-ins plus everything bound before a step inside the loop', () => {
    expect(scopeAtPath(scopeChain, 'steps.3.steps.1.steps.2')).toEqual(['page', 'start', 'vars', 'label', 'authors', 'quotes', 'quote', 'text', 'author'])
  })

  it('never throws on a value that is not even close to a recipe', () => {
    expect(scopeAtPath(null, 'steps.0')).toEqual(['page', 'start', 'vars'])
    expect(scopeAtPath('nope', 'steps.0')).toEqual(['page', 'start', 'vars'])
    expect(scopeAtPath({}, 'steps.0')).toEqual(['page', 'start', 'vars'])
  })

  it('never throws on a recipe whose steps are malformed mid-edit', () => {
    expect(scopeAtPath({ steps: [null, 'nope', { type: 'forEach' }] }, 'steps.2.steps.0')).toEqual(['page', 'start', 'vars'])
  })
})
