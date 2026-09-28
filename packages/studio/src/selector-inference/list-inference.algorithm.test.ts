import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { domPathOf, parseDocument } from './dom-path.model'
import { candidatesFor } from './selector-candidates.algorithm'
import { bestCandidate, rankCandidates } from './selector-ranking.policy'
import { inferList } from './list-inference.algorithm'
import { ShadowDomUnsupportedError } from './shadow-dom.error'

function fixture (name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8')
}

const booksHtml = fixture('books-listing.fixture.html')
const wrapperTrapHtml = fixture('wrapper-trap.fixture.html')
const shiftedFieldHtml = fixture('shifted-field.fixture.html')
const generatedClassesHtml = fixture('generated-classes.fixture.html')
const shadowDomHtml = fixture('shadow-dom.fixture.html')
const lateContentHtml = fixture('late-content.fixture.html')

/** Two clicks on "the same field of two different items", the shape the studio's picker overlay would send. */
function pickTwo (html: string, selector: string): { pathA: ReturnType<typeof domPathOf>, pathB: ReturnType<typeof domPathOf> } {
  const $ = parseDocument(html)
  const nodes = $(selector)
  if (nodes.length < 2) throw new Error(`fixture bug: "${selector}" matched ${nodes.length} nodes, need at least 2`)

  return { pathA: domPathOf($, nodes.eq(0)), pathB: domPathOf($, nodes.eq(1)) }
}

describe('inferList: the books.toscrape-shaped case', () => {
  it('infers article.product_pod as the item and a relative field selector for the price', () => {
    const { pathA, pathB } = pickTwo(booksHtml, '.price_color')
    const result = inferList(pathA, pathB)
    expect(result).not.toBeNull()
    const itemBest = bestCandidate(booksHtml, candidatesFor(result!.itemPath, false))
    expect(itemBest?.selector).toBe('article.product_pod')
    expect(itemBest?.matches).toBe(3)

    const fieldBest = bestCandidate(booksHtml, candidatesFor(result!.fieldPath))
    expect(fieldBest?.selector).toBe('p.price_color')
    // Verified *within one item's own markup*, the way `from: item` runs it: exactly one match, not three.
    const $ = parseDocument(booksHtml)
    const itemHtml = $.html($('article.product_pod').eq(0))
    expect(rankCandidates(itemHtml, [{ selector: fieldBest!.selector, tier: fieldBest!.tier }])[0].matches).toBe(1)
  })

  it('infers the same item from the title field too', () => {
    const { pathA, pathB } = pickTwo(booksHtml, 'h3 a')
    const result = inferList(pathA, pathB)
    const itemBest = bestCandidate(booksHtml, candidatesFor(result!.itemPath, false))
    expect(itemBest?.selector).toBe('article.product_pod')
  })

  it('returns null for two picks that are not on a coherent list (nested inside each other)', () => {
    const $ = parseDocument(booksHtml)
    const article = domPathOf($, $('article.product_pod').first())
    const price = domPathOf($, $('.price_color').first())
    expect(inferList(article, price)).toBeNull()
  })

  it('returns null for the very same node picked twice', () => {
    const $ = parseDocument(booksHtml)
    const path = domPathOf($, $('.price_color').first())
    expect(inferList(path, path)).toBeNull()
  })
})

describe('inferList: the wrapper trap', () => {
  it('lands on <li>, not the single-child div.wrap or article.product_pod, because only the <li>s are real siblings', () => {
    const { pathA, pathB } = pickTwo(wrapperTrapHtml, '.price_color')
    const result = inferList(pathA, pathB)
    expect(result).not.toBeNull()
    expect(result!.itemPath.at(-1)?.tag).toBe('li')

    const itemBest = bestCandidate(wrapperTrapHtml, candidatesFor(result!.itemPath, false))
    expect(itemBest?.matches).toBe(3) // every li, the true repeating unit
    expect(itemBest?.selector).not.toContain('wrap')

    // The field selector still reaches the price through the wrapper, relative to the item.
    const fieldBest = bestCandidate(wrapperTrapHtml, candidatesFor(result!.fieldPath))
    expect(fieldBest?.selector).toBe('p.price_color')
  })
})

describe('inferList: the shifted-field trap', () => {
  it('produces a field selector that is simply missing on the item that lacks it, instead of borrowing the next item\'s value', () => {
    const { pathA, pathB } = pickTwo(shiftedFieldHtml, '.price_color') // item 1 and item 3: item 2 has no price at all
    const result = inferList(pathA, pathB)
    expect(result).not.toBeNull()
    const fieldBest = bestCandidate(shiftedFieldHtml, candidatesFor(result!.fieldPath))
    expect(fieldBest?.selector).toBe('p.price_color')

    const $ = parseDocument(shiftedFieldHtml)
    const items = $('li.product_pod').map((_index, element) => $.html(element)).toArray()
    const matchesPerItem = items.map(itemHtml => rankCandidates(itemHtml, [{ selector: fieldBest!.selector, tier: fieldBest!.tier }])[0]?.matches ?? 0)
    // Read `from` each item on its own: item 2 (index 1) simply has no match — not item 3's price shifted into it.
    expect(matchesPerItem).toEqual([1, 0, 1])
  })
})

describe('inferList: generated/hashed class names', () => {
  it('never builds the item or field selector on a generated class, even though one is present on every item', () => {
    const { pathA, pathB } = pickTwo(generatedClassesHtml, '.price_color')
    const result = inferList(pathA, pathB)
    expect(result).not.toBeNull()
    const itemBest = bestCandidate(generatedClassesHtml, candidatesFor(result!.itemPath, false))
    expect(itemBest?.selector).toBe('li.product_pod')
    expect(itemBest?.selector).not.toMatch(/css-|jss/)

    const fieldBest = bestCandidate(generatedClassesHtml, candidatesFor(result!.fieldPath))
    expect(fieldBest?.selector).toBe('p.price_color')
    expect(fieldBest?.selector).not.toContain('wrapper__')
  })
})

describe('inferList: shadow DOM', () => {
  it('throws a clear, typed error instead of silently mis-inferring', () => {
    const $ = parseDocument(shadowDomHtml)
    const inside = domPathOf($, $('.price_color'))
    // A path that never reaches <html> (cut short at the shadow root's content boundary) is exactly what shadow DOM looks like to this slice.
    expect(inside[0]?.tag).not.toBe('html')
    expect(() => inferList(inside, inside)).toThrow(ShadowDomUnsupportedError)
  })
})

describe('inferList: late content (the snapshot must already be post-render, not this slice\'s job)', () => {
  it('happily infers a selector over whatever markup it is given, pre-render shell included — this slice has no way to know, and is not supposed to', () => {
    const $ = parseDocument(lateContentHtml)
    const shellItems = $('#shell .loading')
    expect(shellItems).toHaveLength(1) // Only one placeholder: nothing to infer a *list* from yet, which is the actual symptom of picking too early.
    const path = domPathOf($, shellItems)
    const best = bestCandidate(lateContentHtml, candidatesFor(path))
    expect(best?.selector).toBe('li.loading') // A selector was still produced; it targets the placeholder, not real data — page-snapshot capturing post-render is what prevents this in practice.
  })

  it('infers correctly once given the rendered markup', () => {
    const { pathA, pathB } = pickTwo(lateContentHtml, '#rendered .price_color')
    const result = inferList(pathA, pathB)
    expect(result).not.toBeNull()
    const itemBest = bestCandidate(lateContentHtml, candidatesFor(result!.itemPath, false))
    expect(itemBest?.selector).toBe('li.product_pod')
  })
})
