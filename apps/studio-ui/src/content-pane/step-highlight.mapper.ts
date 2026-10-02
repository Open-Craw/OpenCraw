import type { DocumentTreeNodeView, OutlineView } from '@opencraw/studio'
import { allSteps } from '../steps-outline'
import type { CellRange } from './grid-pick.mapper'
import type { PointsBox } from './pdf-pick.mapper'

/** An extract step already in the recipe, as the document canvases match it against what they draw (issues #124, #125): its id (the cross-panel highlight's own currency, `hoveredStepId`), its kind and its selector. */
export interface PickedStep {
  id:       string
  kind:     string
  selector: string
}

/** A `region` step's box, parsed back from its selector: `page=` for a PDF, `slide=` for a deck, `at` the number or `'*'` for every one. */
export interface RegionBox {
  on:  'page' | 'slide'
  at:  number | '*'
  box: PointsBox
}

/** A grid `jsonpath` step's cells, parsed back from the selector `grid-pick.mapper.ts`'s `cellSelector` writes. */
export interface CellAddress {
  sheet: string
  range: CellRange
}

const REGION_PATTERN = /^\s*(page|slide)=(\*|\d+)\s+x=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)\s+y=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)\s*$/
const CELL_PATTERN = /^\$\.sheets\[\?\(@\.name==(?:'([^']*)'|"((?:[^"\\]|\\.)*)")\)\]\.rows\[(\d+)(?::(\d+))?\]\[(\d+)(?::(\d+))?\]$/
const CHART_PATTERN = /^\$\.slides\[(\d+)\]\.charts\[(\d+)\]\.series$/

/**
 * Every extract step of the outline with a selector, flattened (brackets'
 * children included): what each canvas marks as "already in the recipe"
 * and resolves a hover against (issue #119: a selector already in the
 * recipe is marked on both the document and the recipe).
 *
 * @param outline - The recipe's outline, `undefined` before one is loaded.
 */
export function pickedSteps (outline: OutlineView | undefined): PickedStep[] {
  const steps: PickedStep[] = []
  for (const node of allSteps(outline)) {
    const { id, kind, selector } = node.step
    if (typeof id !== 'string' || typeof kind !== 'string' || typeof selector !== 'string' || node.step.type !== 'extract') continue
    steps.push({ id, kind, selector })
  }

  return steps
}

/**
 * The ids of the steps that read exactly this tree node (issue #124): a
 * `jsonpath`/`xpath` step whose selector is the node's own path, or the
 * list path the node belongs to (`$.results[*].name` reads every name,
 * this one included).
 *
 * @param node - The tree node.
 * @param steps - The recipe's picked steps.
 */
export function stepIdsForTreeNode (node: DocumentTreeNodeView, steps: readonly PickedStep[]): string[] {
  const paths = new Set([node.jsonpath, node.xpath, node.listPath].filter((path): path is string => path !== undefined))

  return steps.filter(step => paths.has(step.selector) && (step.kind === 'jsonpath' || step.kind === 'xpath')).map(step => step.id)
}

/**
 * A `region` step's box, from its selector — the same grammar
 * `@opencraw/core`'s `parseRegion` reads (mirrored here: this app never
 * imports core's runtime); `undefined` for a selector that does not parse.
 *
 * @param selector - The region selector (`page=1 x=72..252 y=640..664`).
 */
export function parseRegionBox (selector: string): RegionBox | undefined {
  const match = REGION_PATTERN.exec(selector)
  if (match === null) return undefined
  const [, on, at, x1, x2, y1, y2] = match

  return { on: on as 'page' | 'slide', at: at === '*' ? '*' : Number(at), box: { x1: Number(x1), y1: Number(y1), x2: Number(x2), y2: Number(y2) } }
}

/**
 * The `region` steps that read page (or slide) `at` of the document, with
 * their boxes: the ones a canvas draws as already in the recipe.
 *
 * @param steps - The recipe's picked steps.
 * @param on - `page` for the PDF canvas, `slide` for the deck canvas.
 * @param at - The page or slide number shown.
 */
export function regionStepsAt (steps: readonly PickedStep[], on: 'page' | 'slide', at: number): { id: string, box: PointsBox }[] {
  const found: { id: string, box: PointsBox }[] = []
  for (const step of steps) {
    if (step.kind !== 'region') continue
    const region = parseRegionBox(step.selector)
    if (region === undefined || region.on !== on || (region.at !== '*' && region.at !== at)) continue
    found.push({ id: step.id, box: region.box })
  }

  return found
}

/**
 * Whether at least half of `inner`'s area lies inside `outer` — the rule
 * `@opencraw/core`'s `isInsideRegion` reads a cell or a text box by
 * (mirrored here), so a canvas marks exactly what the step reads. A
 * zero-area box counts by its corner.
 *
 * @param inner - The cell's or text box's own box.
 * @param outer - The region's box.
 */
export function isHalfInside (inner: PointsBox, outer: PointsBox): boolean {
  const [ix1, ix2] = ordered(inner.x1, inner.x2)
  const [iy1, iy2] = ordered(inner.y1, inner.y2)
  const [ox1, ox2] = ordered(outer.x1, outer.x2)
  const [oy1, oy2] = ordered(outer.y1, outer.y2)
  const area = (ix2 - ix1) * (iy2 - iy1)
  if (area === 0) return ix1 >= ox1 && ix1 <= ox2 && iy1 >= oy1 && iy1 <= oy2
  const overlap = Math.max(0, Math.min(ix2, ox2) - Math.max(ix1, ox1)) * Math.max(0, Math.min(iy2, oy2) - Math.max(iy1, oy1))

  return overlap >= area / 2
}

/**
 * The ids of the region steps (among `regions`, already filtered to the
 * page or slide shown) that read `box`: a cell's or a text box's.
 *
 * @param box - The cell's or text box's own box.
 * @param regions - The page's or slide's region steps ({@link regionStepsAt}).
 */
export function stepIdsForBox (box: PointsBox, regions: readonly { id: string, box: PointsBox }[]): string[] {
  return regions.filter(region => isHalfInside(box, region.box)).map(region => region.id)
}

/**
 * A grid `jsonpath` step's sheet and cells, parsed back from the selector
 * `cellSelector` writes; `undefined` for any other jsonpath (one a person
 * wrote by hand reads whatever it reads — not marked on the grid).
 *
 * @param selector - The jsonpath.
 */
export function parseCellSelector (selector: string): CellAddress | undefined {
  const match = CELL_PATTERN.exec(selector)
  if (match === null) return undefined
  const [, single, double, top, bottom, left, right] = match
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll), same as pdf-pick.mapper.ts.
  const sheet = single ?? (double ?? '').replace(/\\(.)/g, '$1')

  return { sheet, range: { top: Number(top), left: Number(left), bottom: bottom === undefined ? Number(top) : Number(bottom) - 1, right: right === undefined ? Number(left) : Number(right) - 1 } }
}

/**
 * The grid steps that read cells of `sheet`, with their ranges: the ones
 * the grid canvas marks as already in the recipe.
 *
 * @param steps - The recipe's picked steps.
 * @param sheet - The sheet shown, by name.
 */
export function cellStepsOnSheet (steps: readonly PickedStep[], sheet: string): { id: string, range: CellRange }[] {
  const found: { id: string, range: CellRange }[] = []
  for (const step of steps) {
    if (step.kind !== 'jsonpath') continue
    const address = parseCellSelector(step.selector)
    if (address === undefined || address.sheet !== sheet) continue
    found.push({ id: step.id, range: address.range })
  }

  return found
}

/** The ids of the cell steps (already filtered to the sheet shown) whose range holds the cell at `(row, column)`. */
export function stepIdsForCell (row: number, column: number, cells: readonly { id: string, range: CellRange }[]): string[] {
  return cells.filter(({ range }) => row >= range.top && row <= range.bottom && column >= range.left && column <= range.right).map(cell => cell.id)
}

/**
 * The id of the step reading a deck chart's series (`deckChartCardNode`'s
 * own `$.slides[i].charts[j].series`), by the chart's slide and chart
 * indexes; `undefined` when none does.
 *
 * @param steps - The recipe's picked steps.
 * @param slideIndex - The slide's index into the deck's slides.
 * @param chartIndex - The chart's index into the slide's charts.
 */
export function stepIdForChart (steps: readonly PickedStep[], slideIndex: number, chartIndex: number): string | undefined {
  for (const step of steps) {
    if (step.kind !== 'jsonpath') continue
    const match = CHART_PATTERN.exec(step.selector)
    if (match !== null && Number(match[1]) === slideIndex && Number(match[2]) === chartIndex) return step.id
  }

  return undefined
}

function ordered (a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}
