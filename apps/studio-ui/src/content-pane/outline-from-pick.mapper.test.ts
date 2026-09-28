import type { FieldPick, InferSelectorView } from '@opencraw/studio'
import { listOutlineNodes, readCardNode, spliceTopLevel } from './outline-from-pick.mapper'

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

  it('replaces the node at replaceAt (a single Read card upgraded into the list shape)', () => {
    const [items, forEach] = listOutlineNodes({ kind: 'list', item: { selector: 'article.product_pod', tier: 'class', matches: 20 }, field: priceField }, 'steps.0')
    const result = spliceTopLevel(existing, 0, [items, forEach])
    expect(result.map(node => node.stepType)).toEqual(['extract', 'forEach'])
    expect(result.map(node => node.path)).toEqual(['steps.0', 'steps.1'])
    expect((result[1] as typeof forEach).children.at(0)?.path).toBe('steps.1.steps.0')
  })
})
