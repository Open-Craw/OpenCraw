import type { DocumentTreeNodeView, OutlineView } from '@opencraw/studio'
import { cellStepsOnSheet, isHalfInside, parseCellSelector, parseRegionBox, pickedSteps, regionStepsAt, stepIdForChart, stepIdsForBox, stepIdsForCell, stepIdsForTreeNode } from './step-highlight.mapper'

const OUTLINE: OutlineView = {
  recipeId: 'r',
  steps:    [
    { kind: 'card', path: 'steps.0', stepType: 'request', sentence: [], custom: false, step: { type: 'request', id: 'doc', url: 'x' } },
    { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'title', kind: 'region', selector: 'page=1 x=71..273 y=799..813' } },
    {
      kind:     'bracket',
      path:     'steps.2',
      stepType: 'forEach',
      sentence: [],
      children: [
        { kind: 'card', path: 'steps.2.steps.0', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'name', kind: 'jsonpath', selector: '$.results[*].name', many: true } },
      ],
      step: { type: 'forEach', over: 'rows', as: 'row', steps: [] },
    },
    { kind: 'card', path: 'steps.3', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'price', kind: 'jsonpath', selector: "$.sheets[?(@.name=='Prices')].rows[2][1]", take: 'json' } },
    { kind: 'card', path: 'steps.4', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'sales', kind: 'jsonpath', selector: '$.slides[2].charts[0].series', take: 'json' } },
    { kind: 'card', path: 'steps.5', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'footer', kind: 'region', selector: 'slide=* x=60..360 y=500..520' } },
  ],
} as unknown as OutlineView

describe('pickedSteps', () => {
  it('lists every extract step with a selector, brackets\' children included, as id/kind/selector', () => {
    expect(pickedSteps(OUTLINE).map(step => step.id)).toEqual(['title', 'name', 'price', 'sales', 'footer'])
    expect(pickedSteps(undefined)).toEqual([])
  })
})

describe('stepIdsForTreeNode (issue #124)', () => {
  const node: DocumentTreeNodeView = { id: 'n', label: 'name', valueType: 'string', jsonpath: '$.results[0].name', listPath: '$.results[*].name', children: [] }

  it('matches a step by the node\'s exact path or the list path it belongs to', () => {
    expect(stepIdsForTreeNode(node, pickedSteps(OUTLINE))).toEqual(['name'])
    expect(stepIdsForTreeNode(node, [{ id: 'first', kind: 'jsonpath', selector: '$.results[0].name' }])).toEqual(['first'])
    expect(stepIdsForTreeNode({ ...node, jsonpath: '$.other', listPath: undefined }, pickedSteps(OUTLINE))).toEqual([])
  })
})

describe('parseRegionBox / regionStepsAt / isHalfInside / stepIdsForBox (issue #125)', () => {
  it('parses page= and slide= selectors, refusing anything else', () => {
    expect(parseRegionBox('page=1 x=71..273 y=799..813')).toEqual({ on: 'page', at: 1, box: { x1: 71, y1: 799, x2: 273, y2: 813 } })
    expect(parseRegionBox('slide=* x=60..360 y=500..520')?.at).toBe('*')
    expect(parseRegionBox('somewhere')).toBeUndefined()
  })

  it('finds the region steps reading the page or slide shown, a wildcard on every one', () => {
    const steps = pickedSteps(OUTLINE)
    expect(regionStepsAt(steps, 'page', 1).map(step => step.id)).toEqual(['title'])
    expect(regionStepsAt(steps, 'page', 2)).toEqual([])
    expect(regionStepsAt(steps, 'slide', 4).map(step => step.id)).toEqual(['footer'])
  })

  it('reads a box as inside when at least half its area is, a zero-area box by its corner', () => {
    const region = { x1: 0, y1: 0, x2: 100, y2: 100 }
    expect(isHalfInside({ x1: 90, y1: 0, x2: 110, y2: 10 }, region)).toBe(true)
    expect(isHalfInside({ x1: 95, y1: 0, x2: 115, y2: 10 }, region)).toBe(false)
    expect(isHalfInside({ x1: 50, y1: 50, x2: 50, y2: 50 }, region)).toBe(true)
    const pageOne = regionStepsAt(pickedSteps(OUTLINE), 'page', 1)
    expect(stepIdsForBox({ x1: 72, y1: 800, x2: 272, y2: 812 }, pageOne)).toEqual(['title'])
  })
})

describe('parseCellSelector / cellStepsOnSheet / stepIdsForCell (issue #125)', () => {
  it('parses one cell and a rectangle back from cellSelector\'s own shape, either quoting', () => {
    expect(parseCellSelector("$.sheets[?(@.name=='Prices')].rows[2][1]")).toEqual({ sheet: 'Prices', range: { top: 2, left: 1, bottom: 2, right: 1 } })
    expect(parseCellSelector("$.sheets[?(@.name=='Prices')].rows[1:3][0:2]")).toEqual({ sheet: 'Prices', range: { top: 1, left: 0, bottom: 2, right: 1 } })
    expect(parseCellSelector('$.sheets[?(@.name=="Bob\'s")].rows[0][0]')?.sheet).toBe("Bob's")
    expect(parseCellSelector('$.sheets[0].rows[*]')).toBeUndefined()
  })

  it('finds the cell steps on the sheet shown and the ones holding a cell', () => {
    const cells = cellStepsOnSheet(pickedSteps(OUTLINE), 'Prices')
    expect(cells).toEqual([{ id: 'price', range: { top: 2, left: 1, bottom: 2, right: 1 } }])
    expect(stepIdsForCell(2, 1, cells)).toEqual(['price'])
    expect(stepIdsForCell(2, 0, cells)).toEqual([])
    expect(cellStepsOnSheet(pickedSteps(OUTLINE), 'Other')).toEqual([])
  })
})

describe('stepIdForChart (issue #125)', () => {
  it('finds the step reading a chart\'s series by slide and chart index', () => {
    expect(stepIdForChart(pickedSteps(OUTLINE), 2, 0)).toBe('sales')
    expect(stepIdForChart(pickedSteps(OUTLINE), 2, 1)).toBeUndefined()
  })
})
