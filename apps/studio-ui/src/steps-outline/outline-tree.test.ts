import type { OutlineNode, OutlineView } from '@opencraw/studio'
import { issuesForNode, listAt, listPathPrefix, withList, withNode } from './outline-tree'

function card (path: string, stepType = 'goto'): OutlineNode {
  return { kind: 'card', path, stepType, sentence: [], step: { type: stepType }, custom: false }
}

function bracket (path: string, children: OutlineNode[], elseChildren?: OutlineNode[]): OutlineNode {
  return { kind: 'bracket', path, stepType: elseChildren === undefined ? 'forEach' : 'if', sentence: [], step: { type: 'forEach' }, children, ...(elseChildren !== undefined && { elseChildren }) }
}

describe('listAt / withList', () => {
  const outline: OutlineView = {
    recipe: {},
    steps:  [card('steps.0'), bracket('steps.1', [card('steps.1.steps.0')], [card('steps.1.else.0')])],
  }

  it('reads the top-level list', () => {
    expect(listAt(outline, '')).toHaveLength(2)
  })

  it('reads a bracket\'s "then" and "else" lists by its path', () => {
    expect(listAt(outline, 'steps.1::then')).toEqual([card('steps.1.steps.0')])
    expect(listAt(outline, 'steps.1::else')).toEqual([card('steps.1.else.0')])
  })

  it('replaces the top-level list', () => {
    const updated = withList(outline, '', [card('steps.0')])
    expect(updated.steps).toHaveLength(1)
  })

  it('replaces a nested list without disturbing the rest of the tree', () => {
    const updated = withList(outline, 'steps.1::then', [card('steps.1.steps.0'), card('steps.1.steps.1')])
    expect(listAt(updated, 'steps.1::then')).toHaveLength(2)
    expect(listAt(updated, 'steps.1::else')).toHaveLength(1)
    expect(updated.steps[0]).toEqual(card('steps.0'))
  })
})

describe('withNode', () => {
  it('replaces a top-level node in place', () => {
    const outline: OutlineView = { recipe: {}, steps: [card('steps.0')] }
    const updated = withNode(outline, 'steps.0', node => ({ ...node, step: { ...node.step, url: '/x' } }))
    expect(updated.steps[0].step.url).toBe('/x')
  })

  it('finds and replaces a node nested inside a bracket', () => {
    const outline: OutlineView = { recipe: {}, steps: [bracket('steps.0', [card('steps.0.steps.0')])] }
    const updated = withNode(outline, 'steps.0.steps.0', node => ({ ...node, step: { ...node.step, id: 'x' } }))
    const nested = listAt(updated, 'steps.0::then')[0]
    expect(nested.step.id).toBe('x')
  })
})

describe('listPathPrefix', () => {
  it('is "steps" at the top level', () => {
    expect(listPathPrefix('')).toBe('steps')
  })

  it('is "<bracket>.steps" for a "then" branch and "<bracket>.else" for an "else" branch', () => {
    expect(listPathPrefix('steps.1::then')).toBe('steps.1.steps')
    expect(listPathPrefix('steps.1::else')).toBe('steps.1.else')
  })
})

describe('issuesForNode', () => {
  const issues = [
    { path: 'steps.1', message: 'own issue' },
    { path: 'steps.1.as', message: 'own field issue' },
    { path: 'steps.1.steps.0', message: 'a descendant\'s issue' },
    { path: 'steps.10', message: 'unrelated' },
  ]

  it('matches the node\'s own path and its own fields, not a descendant\'s', () => {
    const mine = issuesForNode(issues, 'steps.1')
    expect(mine.map(issue => issue.message)).toEqual(['own issue', 'own field issue'])
  })

  it('matches nothing for an unrelated path', () => {
    expect(issuesForNode(issues, 'steps.5')).toEqual([])
  })
})
