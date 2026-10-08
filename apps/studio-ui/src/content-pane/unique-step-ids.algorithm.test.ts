import type { OutlineNode } from '@opencraw/studio'
import { listOutlineNodes, readCardNode, spliceTopLevel } from './outline-from-pick.mapper'
import { withUniqueStepIds } from './unique-step-ids.algorithm'

const field = { selector: 'h1', take: 'text' } as Parameters<typeof readCardNode>[0]
const list = { kind: 'list', item: { selector: 'li' }, field: { selector: 'a', take: 'text' } } as Parameters<typeof listOutlineNodes>[0]

const idOf = (node: OutlineNode): unknown => node.step.id
const ids = (nodes: readonly OutlineNode[]): unknown[] => nodes.map(node => idOf(node))

describe('withUniqueStepIds', () => {
  it('leaves names alone when nothing clashes', () => {
    const incoming = [readCardNode(field, 'steps.0')]
    expect(withUniqueStepIds([], incoming)).toEqual(incoming)
  })

  it('suffixes a second pick of the same default id', () => {
    const first = readCardNode(field, 'steps.0')
    const [second] = withUniqueStepIds([first], [readCardNode(field, 'steps.1')])
    expect(idOf(second)).toBe('value_2')
  })

  it('only ever builds ids the engine accepts: a word of letters, digits and underscores (issue #164)', () => {
    const [second] = withUniqueStepIds([readCardNode(field, 'steps.0')], [readCardNode(field, 'steps.1')])
    expect(idOf(second)).toMatch(/^[A-Z_]\w*$/i)
  })

  it('keeps counting past names already taken', () => {
    const existing = [readCardNode(field, 'steps.0', 'value'), readCardNode(field, 'steps.1', 'value_2')]
    const [third] = withUniqueStepIds(existing, [readCardNode(field, 'steps.2')])
    expect(idOf(third)).toBe('value_3')
  })

  it('renames a picked list consistently: items, alias and the references to them', () => {
    const existing = listOutlineNodes(list, 'steps.0')
    const [items, forEach] = withUniqueStepIds(existing, listOutlineNodes(list, 'steps.2'))

    expect(idOf(items)).toBe('items_2')
    expect(forEach.step).toMatchObject({ over: 'items_2', as: 'item_2' })
    const [child] = (forEach as Extract<OutlineNode, { kind: 'bracket' }>).children
    expect(child.step).toMatchObject({ id: 'value_2', from: 'item_2' })
  })

  it('spliceTopLevel applies it, so two picks append distinct ids', () => {
    const once = spliceTopLevel([], undefined, [readCardNode(field, 'steps.0')])
    const twice = spliceTopLevel(once, undefined, [readCardNode(field, 'steps.1')])
    expect(ids(twice)).toEqual(['value', 'value_2'])
  })

  it('replacing a node does not clash with the node it replaces', () => {
    const once = spliceTopLevel([], undefined, [readCardNode(field, 'steps.0')])
    const replaced = spliceTopLevel(once, 0, [readCardNode(field, 'steps.0')])
    expect(ids(replaced)).toEqual(['value'])
  })
})
