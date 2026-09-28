import type { DomTreeNodeView } from '@opencraw/studio'
import { flattenTree } from './flatten-tree.mapper'

function node (nodeId: string, tag: string, children: DomTreeNodeView[] = [], extra: Partial<DomTreeNodeView> = {}): DomTreeNodeView {
  return { nodeId, tag, attributes: {}, hidden: false, children, ...extra }
}

const paragraph = node('n3', 'p', [], { text: 'hello world' })
const div = node('n2', 'div', [paragraph], { id: 'app' })
const span = node('n4', 'span', [], { classes: ['price'], text: '£10' })
const body = node('n1', 'body', [div, span])
const tree = node('n0', 'html', [body])

describe('flattenTree', () => {
  it('shows only the root when nothing is expanded', () => {
    const rows = flattenTree(tree, new Set())
    expect(rows).toEqual([{ key: 'n0', node: tree, depth: 0, hasChildren: true, expanded: false }])
  })

  it('reveals children of expanded nodes, and only those', () => {
    const rows = flattenTree(tree, new Set(['n0', 'n1']))
    expect(rows.map(row => row.key)).toEqual(['n0', 'n1', 'n2', 'n4'])
    expect(rows.find(row => row.key === 'n2')).toMatchObject({ hasChildren: true, expanded: false })
  })

  it('with a search query, shows every match and force-expands the path to it, ignoring the expanded set', () => {
    const rows = flattenTree(tree, new Set(), 'price')
    expect(rows.map(row => row.key)).toEqual(['n0', 'n1', 'n4'])
  })

  it('matches by id, class and text, case-insensitively', () => {
    expect(flattenTree(tree, new Set(), 'APP').map(row => row.key)).toEqual(['n0', 'n1', 'n2'])
    expect(flattenTree(tree, new Set(), 'hello').map(row => row.key)).toEqual(['n0', 'n1', 'n2', 'n3'])
  })

  it('matches nothing for a query with no hits', () => {
    expect(flattenTree(tree, new Set(), 'nope')).toEqual([])
  })

  it('leaves a hidden node and its whole subtree out by default, and includes it (greyed by the row itself) when told to', () => {
    const hiddenTree = node('n0', 'html', [
      node('n1', 'body', [node('n2', 'input', [], { hidden: true, attributes: { value: 'secret' } })]),
    ])
    expect(flattenTree(hiddenTree, new Set(['n0', 'n1'])).map(row => row.key)).toEqual(['n0', 'n1'])
    expect(flattenTree(hiddenTree, new Set(['n0', 'n1']), '', true).map(row => row.key)).toEqual(['n0', 'n1', 'n2'])
  })
})
