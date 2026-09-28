import type { HttpBody } from '@opencraw/core'
import { documentTreeView } from './tree-view.mapper'
import type { DocumentTreeNode } from './tree-view.mapper'

function findNode (node: DocumentTreeNode, id: string): DocumentTreeNode | undefined {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNode(child, id)
    if (found !== undefined) return found
  }

  return undefined
}

describe('documentTreeView: JSON', () => {
  const data = {
    'name':    'bulbasaur',
    'results': [{ url: 'https://x/1' }, { url: 'https://x/2' }, { url: 'https://x/3' }],
    'odd key': 1,
    'next':    'https://x/page/2',
  }
  const body: HttpBody = { kind: 'json', data }

  it('gives every value its jsonpath, dot notation for a plain key, brackets (quoted) otherwise', () => {
    const view = documentTreeView(body)
    expect(view.format).toBe('json')
    expect(findNode(view.root, '$.name')?.jsonpath).toBe('$.name')
    expect(findNode(view.root, '$["odd key"]')?.jsonpath).toBe('$["odd key"]')
  })

  it('generalises an array item to [*], with the array\'s length as listCount', () => {
    const view = documentTreeView(body)
    const item = findNode(view.root, '$.results[1].url')
    expect(item?.listPath).toBe('$.results[*].url')
    expect(item?.listCount).toBe(3)
  })

  it('gives object/array nodes no listPath, and a leaf a type, a preview and no children', () => {
    const view = documentTreeView(body)
    const results = findNode(view.root, '$.results')
    expect(results?.valueType).toBe('array')
    expect(results?.listPath).toBeUndefined()
    const name = findNode(view.root, '$.name')
    expect(name).toMatchObject({ valueType: 'string', preview: 'bulbasaur', children: [] })
  })

  it('has no namespaces (JSON only)', () => {
    expect(documentTreeView(body).namespaces).toBeUndefined()
  })
})

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Incentivi</title>
  <entry><title>Pandina</title><media:thumbnail url="https://x/1.jpg"/></entry>
  <entry><title>Avenger</title></entry>
</feed>`

describe('documentTreeView: XML', () => {
  const body: HttpBody = { kind: 'xml', xml: ATOM }

  it('synthesises a prefix for the default namespace, and picks up an explicit one, both offered as namespaces', () => {
    const view = documentTreeView(body)
    expect(view.format).toBe('xml')
    // eslint-disable-next-line unicorn/prefer-https -- the fixture's own xmlns:media URI is genuinely http (mirrors core's own xml-document.test.ts ATOM fixture); asserting https would just not match what was parsed.
    expect(view.namespaces).toEqual({ ns: 'http://www.w3.org/2005/Atom', media: 'http://search.yahoo.com/mrss/' })
  })

  it('builds an absolute xpath, adding a [n] predicate only among repeated siblings', () => {
    const view = documentTreeView(body)
    expect(view.root.xpath).toBe('/ns:feed')
    const title = findNode(view.root, '/ns:feed/ns:title')
    expect(title?.xpath).toBe('/ns:feed/ns:title') // the feed's own title: one sibling, no [n]
    const entryTitle = findNode(view.root, '/ns:feed/ns:entry[1]/ns:title')
    expect(entryTitle?.preview).toBe('Pandina')
  })

  it('generalises a repeated element to every sibling, with the count', () => {
    const view = documentTreeView(body)
    const entry = findNode(view.root, '/ns:feed/ns:entry[1]')
    expect(entry?.listPath).toBe('/ns:feed/ns:entry')
    expect(entry?.listCount).toBe(2)
  })

  it('reads an attribute as its own row, addressed with @, and keeps a node\'s own explicit prefix (media:thumbnail, not the default one)', () => {
    const view = documentTreeView(body)
    const thumbnail = findNode(view.root, '/ns:feed/ns:entry[1]/media:thumbnail')
    expect(thumbnail?.label).toBe('media:thumbnail')
    const attribute = thumbnail?.children.find(child => child.label === '@url')
    expect(attribute?.xpath).toBe('/ns:feed/ns:entry[1]/media:thumbnail/@url')
    expect(attribute?.preview).toBe('https://x/1.jpg')
  })
})

describe('documentTreeView: unsupported bodies', () => {
  it('throws, clearly, for a body with no tree canvas', () => {
    expect(() => documentTreeView({ kind: 'html', html: '<p>x</p>' })).toThrow(/no tree canvas/)
    expect(() => documentTreeView({ kind: 'text', text: 'x' })).toThrow(/no tree canvas/)
  })
})
