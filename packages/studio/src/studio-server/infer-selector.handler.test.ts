import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'cheerio'
import { putSnapshot, rewriteDocument } from '../page-snapshot'
import { handleInferSelector } from './infer-selector.handler'
import { createStudioState } from './workspace.store'

const booksHtml = readFileSync(join(__dirname, '..', 'selector-inference', 'fixtures', 'books-listing.fixture.html'), 'utf8')
const snapshotHtml = rewriteDocument(booksHtml, 'https://books.example/').html

function stateWithSnapshot (): ReturnType<typeof createStudioState> {
  const state = createStudioState()
  state.folder = '/tmp/does-not-matter' // infer-selector never touches disk once a snapshot is cached
  putSnapshot(state.snapshots, 'books', 'start', { html: snapshotHtml, nodeCount: 0, baseUrl: 'https://books.example/' })

  return state
}

function nodeId (html: string, selector: string, nth = 0): string {
  const $ = load(html)

  return $(selector).eq(nth).attr('data-oc-node') ?? ''
}

describe('handleInferSelector', () => {
  it('throws when the step has no cached snapshot yet', () => {
    const state = createStudioState()
    expect(() => handleInferSelector(state, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: ['n0'] })).toThrow('call take-snapshot first')
  })

  it('one pick: returns a field candidate for that node, with a verified match count and a take kind', () => {
    const state = stateWithSnapshot()
    const priceId = nodeId(snapshotHtml, '.price_color', 0)

    const result = handleInferSelector(state, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: [priceId] })
    expect(result).toMatchObject({ kind: 'field', field: { selector: 'p.price_color', take: 'text', matches: 3 } })
  })

  it('one pick on a link: take is attr:href', () => {
    const state = stateWithSnapshot()
    const linkId = nodeId(snapshotHtml, 'h3 a', 0)

    const result = handleInferSelector(state, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: [linkId] })
    expect(result.kind).toBe('field')
    if (result.kind === 'field') expect(result.field.take).toBe('attr:href')
  })

  it('two similar picks: returns the safe item+field shape', () => {
    const state = stateWithSnapshot()
    const priceA = nodeId(snapshotHtml, '.price_color', 0)
    const priceB = nodeId(snapshotHtml, '.price_color', 1)

    const result = handleInferSelector(state, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: [priceA, priceB] })
    expect(result).toMatchObject({
      kind:  'list',
      item:  { selector: 'article.product_pod', matches: 3 },
      field: { selector: 'p.price_color', take: 'text', matches: 3 },
    })
  })

  it('two picks that are not a coherent list: "unsupported", with a reason', () => {
    const state = stateWithSnapshot()
    const articleId = nodeId(snapshotHtml, 'article.product_pod', 0)
    const priceId = nodeId(snapshotHtml, '.price_color', 0)

    const result = handleInferSelector(state, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: [articleId, priceId] })
    expect(result.kind).toBe('unsupported')
  })

  it('a node id no longer in the snapshot: "unsupported", not a crash', () => {
    const state = stateWithSnapshot()
    const result = handleInferSelector(state, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: ['n999999'] })
    expect(result.kind).toBe('unsupported')
  })
})
