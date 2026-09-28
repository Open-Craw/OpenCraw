import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { crossesShadowRoot, domPathOf, isStableId, parseDocument } from './dom-path.model'

const booksHtml = readFileSync(join(__dirname, 'fixtures', 'books-listing.fixture.html'), 'utf8')
const shadowHtml = readFileSync(join(__dirname, 'fixtures', 'shadow-dom.fixture.html'), 'utf8')

describe('domPathOf', () => {
  it('describes the path from the document root down to a node, root first', () => {
    const $ = parseDocument(booksHtml)
    const path = domPathOf($, $('article.product_pod').first().find('.price_color'))

    expect(path.map(level => level.tag)).toEqual(['html', 'body', 'div', 'article', 'div', 'p'])
    expect(path.at(-1)?.classes).toEqual(['price_color'])
  })

  it('gives each level its 1-based position and count among same-tag siblings', () => {
    const $ = parseDocument(booksHtml)
    const second = domPathOf($, $('article.product_pod').eq(1))
    const article = second.at(-1)
    expect(article?.tag).toBe('article')
    expect(article?.index).toBe(2)
    expect(article?.siblingCount).toBe(3)
  })

  it('carries an element\'s id and attributes', () => {
    const $ = parseDocument('<div><a id="go" href="/x" data-testid="cta">Go</a></div>')
    const path = domPathOf($, $('a'))
    const leaf = path.at(-1)
    expect(leaf?.id).toBe('go')
    expect(leaf?.attrs.href).toBe('/x')
    expect(leaf?.attrs['data-testid']).toBe('cta')
  })
})

describe('isStableId', () => {
  it('accepts hand-authored ids and rejects framework-generated ones', () => {
    expect(isStableId('go')).toBe(true)
    expect(isStableId('main-nav')).toBe(true)
    expect(isStableId('react-select-2-input')).toBe(false)
    expect(isStableId(':r3:')).toBe(false)
    expect(isStableId('radix-:r1:')).toBe(false)
  })
})

describe('crossesShadowRoot', () => {
  it('detects a declarative shadow root ancestor', () => {
    const $ = parseDocument(shadowHtml)
    const path = domPathOf($, $('.price_color'))
    expect(crossesShadowRoot(path)).toBe(true)
  })

  it('is false for ordinary markup', () => {
    const $ = parseDocument(booksHtml)
    const path = domPathOf($, $('.price_color').first())
    expect(crossesShadowRoot(path)).toBe(false)
  })
})
