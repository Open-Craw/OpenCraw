import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { domPathOf, parseDocument } from './dom-path.model'
import { candidatesFor } from './selector-candidates.algorithm'

const booksHtml = readFileSync(join(__dirname, 'fixtures', 'books-listing.fixture.html'), 'utf8')
const generatedHtml = readFileSync(join(__dirname, 'fixtures', 'generated-classes.fixture.html'), 'utf8')

describe('candidatesFor', () => {
  it('ranks a class-based candidate above structure and position for an ordinary field', () => {
    const $ = parseDocument(booksHtml)
    const path = domPathOf($, $('.price_color').first())
    const candidates = candidatesFor(path)
    expect(candidates[0]).toEqual({ selector: 'p.price_color', tier: 'class' })
    expect(candidates.map(candidate => candidate.tier)).toEqual(expect.arrayContaining(['class', 'structure', 'position']))
  })

  it('prefers a stable data attribute over class when both are present', () => {
    const $ = parseDocument('<div><button data-testid="add" class="btn btn-primary">Add</button></div>')
    const path = domPathOf($, $('button'))
    const candidates = candidatesFor(path)
    expect(candidates[0]).toEqual({ selector: 'button[data-testid="add"]', tier: 'data-attr' })
  })

  it('prefers a stable id over everything else', () => {
    const $ = parseDocument('<div><h1 id="title" class="heading">Hi</h1></div>')
    const path = domPathOf($, $('h1'))
    expect(candidatesFor(path)[0]).toEqual({ selector: '#title', tier: 'id' })
  })

  it('never builds a class candidate on a generated token, falling back to structure/position', () => {
    const $ = parseDocument(generatedHtml)
    const path = domPathOf($, $('.sc-bdVaJa').first())
    const candidates = candidatesFor(path)
    expect(candidates.some(candidate => candidate.selector.includes('sc-bdVaJa'))).toBe(false)
    expect(candidates.some(candidate => candidate.tier === 'structure' || candidate.tier === 'position')).toBe(true)
  })

  it('omits position candidates when asked to, for building an item selector', () => {
    const $ = parseDocument(booksHtml)
    const path = domPathOf($, $('article.product_pod').eq(1))
    const candidates = candidatesFor(path, false)
    expect(candidates.some(candidate => candidate.tier === 'position')).toBe(false)
  })

  it('never uses nth-child, only nth-of-type, in a position candidate', () => {
    const $ = parseDocument(booksHtml)
    const path = domPathOf($, $('article.product_pod').eq(1))
    const position = candidatesFor(path).find(candidate => candidate.tier === 'position')
    expect(position?.selector).not.toMatch(/nth-child/)
    expect(position?.selector).toMatch(/nth-of-type/)
  })

  it('returns nothing for an empty path', () => {
    expect(candidatesFor([])).toEqual([])
  })
})
