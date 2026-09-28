import { matchingNodeIds } from './node-matches.mapper'

const html = '<html data-oc-node="n0"><body data-oc-node="n1"><p class="price" data-oc-node="n2">£10</p><p class="price" data-oc-node="n3">£20</p></body></html>'

describe('matchingNodeIds', () => {
  it('returns every node id a css selector matches', () => {
    expect(matchingNodeIds(html, '.price')).toEqual(new Set(['n2', 'n3']))
  })

  it('returns an empty set for a blank selector', () => {
    expect(matchingNodeIds(html, '')).toEqual(new Set())
  })

  it('returns an empty set for an invalid selector, rather than throwing', () => {
    expect(matchingNodeIds(html, ':::not-a-selector')).toEqual(new Set())
  })
})
