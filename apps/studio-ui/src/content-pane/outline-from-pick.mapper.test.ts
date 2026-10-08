import type { DocumentTreeNodeView, FieldPick, InferSelectorView } from '@opencraw/studio'
import { appendIndex, documentReadCardNode, listOutlineNodes, paginateFromNextNode, readCardNode, spliceTopLevel } from './outline-from-pick.mapper'

const priceField: FieldPick = { selector: '.price_color', tier: 'class', take: 'text', matches: 20 }
const linkField: FieldPick = { selector: 'h3 a', tier: 'structure', take: 'attr:href', matches: 20 }

describe('readCardNode', () => {
  it('builds a css extract step, take omitted for the default (text)', () => {
    const node = readCardNode(priceField, 'steps.0')
    expect(node).toEqual({
      kind:     'card',
      path:     'steps.0',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'value', selector: '.price_color', kind: 'css' },
    })
  })

  it('carries a non-default take', () => {
    const node = readCardNode(linkField, 'steps.0')
    expect(node.step.take).toBe('attr:href')
  })
})

describe('listOutlineNodes', () => {
  const listResult: Extract<InferSelectorView, { kind: 'list' }> = {
    kind:  'list',
    item:  { selector: 'article.product_pod', tier: 'class', matches: 20 },
    field: priceField,
  }

  it('builds the safe extract(items)+forEach(field from item) shape', () => {
    const [items, forEach] = listOutlineNodes(listResult, 'steps.0')
    expect(items.step).toEqual({ type: 'extract', id: 'items', selector: 'article.product_pod', kind: 'css', take: 'html', many: true })
    expect(forEach.step).toEqual({ type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] })
    expect(forEach.children).toHaveLength(1)
    expect(forEach.children.at(0)?.step).toEqual({ type: 'extract', id: 'value', from: 'item', selector: '.price_color', kind: 'css' })
  })

  it('never reads the field selector against the whole document: it always carries "from": the item alias', () => {
    const [, forEach] = listOutlineNodes(listResult, 'steps.0')
    expect(forEach.children.at(0)?.step.from).toBe('item')
  })

  it('places the items extract and the forEach as siblings, the field one level inside the forEach', () => {
    const [items, forEach] = listOutlineNodes(listResult, 'steps.2')
    expect(items.path).toBe('steps.2')
    expect(forEach.path).toBe('steps.3')
    expect(forEach.children.at(0)?.path).toBe('steps.3.steps.0')
  })
})

describe('spliceTopLevel', () => {
  const existing = [readCardNode(priceField, 'steps.0', 'existing')]

  it('appends when replaceAt is undefined', () => {
    const result = spliceTopLevel(existing, undefined, [readCardNode(linkField, 'x', 'new')])
    expect(result.map(node => node.step.id)).toEqual(['existing', 'new'])
    expect(result.map(node => node.path)).toEqual(['steps.0', 'steps.1'])
  })

  it('appends before a trailing emit, so the picked read runs before the record is emitted (issue #155)', () => {
    const emit = { kind: 'card' as const, path: 'steps.1', stepType: 'emit', sentence: [], custom: false, step: { type: 'emit' } }
    const withEmit = [existing[0], emit]
    const result = spliceTopLevel(withEmit, undefined, [readCardNode(linkField, 'x', 'new')])
    expect(result.map(node => node.stepType)).toEqual(['extract', 'extract', 'emit'])
    expect(result.map(node => node.path)).toEqual(['steps.0', 'steps.1', 'steps.2'])
    expect(appendIndex(withEmit)).toBe(1)
    expect(appendIndex(existing)).toBe(1)
    expect(appendIndex([])).toBe(0)
  })

  it('replaces the node at replaceAt (a single Read card upgraded into the list shape)', () => {
    const [items, forEach] = listOutlineNodes({ kind: 'list', item: { selector: 'article.product_pod', tier: 'class', matches: 20 }, field: priceField }, 'steps.0')
    const result = spliceTopLevel(existing, 0, [items, forEach])
    expect(result.map(node => node.stepType)).toEqual(['extract', 'forEach'])
    expect(result.map(node => node.path)).toEqual(['steps.0', 'steps.1'])
    expect((result[1] as typeof forEach).children.at(0)?.path).toBe('steps.1.steps.0')
  })
})

const jsonLeaf: DocumentTreeNodeView = { id: '$.name', label: 'name', valueType: 'string', preview: 'bulbasaur', jsonpath: '$.name', children: [] }
const jsonListItem: DocumentTreeNodeView = { id: '$.results[2].url', label: 'url', valueType: 'string', preview: 'https://x/2', jsonpath: '$.results[2].url', listPath: '$.results[*].url', listCount: 3, children: [] }
const xmlLeaf: DocumentTreeNodeView = { id: '/a:feed/a:title', label: 'a:title', valueType: 'string', preview: 'Incentivi', xpath: '/a:feed/a:title', children: [] }

describe('documentReadCardNode', () => {
  it('builds a jsonpath extract from a JSON node', () => {
    const node = documentReadCardNode(jsonLeaf, 'steps.0')
    expect(node).toEqual({
      kind:     'card',
      path:     'steps.0',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'value', selector: '$.name', kind: 'jsonpath' },
    })
  })

  it('generalises to the listPath, with many: true, when asked to', () => {
    const node = documentReadCardNode(jsonListItem, 'steps.0', { id: 'urls', generalize: true })
    expect(node.step).toEqual({ type: 'extract', id: 'urls', selector: '$.results[*].url', kind: 'jsonpath', many: true })
  })

  it('refuses to generalise a node with no listPath', () => {
    expect(() => documentReadCardNode(jsonLeaf, 'steps.0', { generalize: true })).toThrow(/no list to generalise/)
  })

  it('builds an xpath extract from an XML node, with namespaces only when the document declares any', () => {
    const bare = documentReadCardNode(xmlLeaf, 'steps.0')
    expect(bare.step).toEqual({ type: 'extract', id: 'value', selector: '/a:feed/a:title', kind: 'xpath' })
    const withNs = documentReadCardNode(xmlLeaf, 'steps.0', { namespaces: { a: 'http://www.w3.org/2005/Atom' } })
    expect(withNs.step).toEqual({ type: 'extract', id: 'value', selector: '/a:feed/a:title', kind: 'xpath', namespaces: { a: 'http://www.w3.org/2005/Atom' } })
  })
})

describe('paginateFromNextNode', () => {
  it('builds an empty paginate bracket reading the picked node on every page', () => {
    const next: DocumentTreeNodeView = { id: '$.next', label: 'next', valueType: 'string', preview: 'https://x/page/2', jsonpath: '$.next', children: [] }
    const bracket = paginateFromNextNode(next, 'steps.1')
    expect(bracket).toEqual({ kind: 'bracket', path: 'steps.1', stepType: 'paginate', sentence: [], children: [], step: { type: 'paginate', next: { jsonpath: '$.next' }, steps: [] } })
  })

  it('refuses an XML pick: paginate.next has no xpath form', () => {
    expect(() => paginateFromNextNode(xmlLeaf, 'steps.1')).toThrow(/jsonpath/)
  })
})
