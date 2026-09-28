import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { domPathOf, parseDocument } from './dom-path.model'
import { candidatesFor } from './selector-candidates.algorithm'
import { bestCandidate, rankCandidates } from './selector-ranking.policy'

const booksHtml = readFileSync(join(__dirname, 'fixtures', 'books-listing.fixture.html'), 'utf8')

describe('rankCandidates + bestCandidate', () => {
  it('verifies each candidate against real markup with the engine\'s own matching, dropping ones that match nothing', () => {
    const ranked = rankCandidates(booksHtml, [{ selector: 'p.price_color', tier: 'class' }, { selector: '.nothing-like-this', tier: 'class' }])
    expect(ranked).toHaveLength(1)
    expect(ranked[0]).toMatchObject({ selector: 'p.price_color', matches: 3 })
  })

  it('picks the class candidate for a single-field pick, verified to match exactly the one node', () => {
    const $ = parseDocument(booksHtml)
    const path = domPathOf($, $('.price_color').first())
    const best = bestCandidate(booksHtml, candidatesFor(path))
    expect(best?.selector).toBe('p.price_color')
    expect(best?.matches).toBe(3) // Correctly ambiguous without `from: item` scoping — proves *why* the safe shape reads each field from its own item instead of the whole document.
  })

  it('sorts candidates that hit the target above those that do not, when a target node id is given', () => {
    const stamped = '<ul><li class="x" data-oc-node="a"><span class="tag">A</span></li><li class="x" data-oc-node="b"><span class="tag">B</span></li></ul>'
    const ranked = rankCandidates(stamped, [{ selector: 'li.x', tier: 'class' }, { selector: 'span.tag', tier: 'class' }], 'a')
    expect(ranked[0].selector).toBe('li.x')
    expect(ranked[0].hitsTarget).toBe(true)
  })

  it('returns undefined when nothing matches', () => {
    expect(bestCandidate(booksHtml, [{ selector: '.does-not-exist', tier: 'class' }])).toBeUndefined()
  })
})
