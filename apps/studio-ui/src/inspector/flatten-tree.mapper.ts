import type { DomTreeNodeView } from '@opencraw/studio'

/** One row the virtualized DOM tree actually renders — the tree flattened to a list, which is what a virtualizer needs (issue #93: real pages have tens of thousands of nodes). */
export interface FlatTreeRow {
  /** The node's own `data-oc-node` id; unique, so it doubles as the row's React/virtualizer key. */
  key:         string
  node:        DomTreeNodeView
  depth:       number
  hasChildren: boolean
  expanded:    boolean
}

/**
 * Flattens a DOM tree into the rows the virtualized list renders, honouring
 * which nodes are expanded and an optional search query.
 *
 * With no query, only expanded nodes reveal their children (a collapsed
 * branch of a real page can be thousands of nodes deep — this is what makes
 * the tree usable rather than merely correct). With a query, every node
 * whose own tag/id/classes/text/attributes match, or that has a matching
 * descendant, is shown and force-expanded, so a search surfaces where a
 * match sits rather than requiring it to already be expanded.
 *
 * @param root - The tree's root (`inspect-page`'s `InspectView.tree`).
 * @param expanded - Which node ids are expanded; ignored while `query` is set.
 * @param query - A tag/class/text/attribute substring to filter by, case-insensitively; `''` shows everything, gated by `expanded`.
 * @param showHidden - The same toggle the rendered view has: `false` (the default) leaves a `data-oc-hidden` node and its whole subtree out entirely, matching what the live page actually showed; `true` includes it (the row itself renders greyed — `tree-row.component.tsx`'s job, not this function's).
 * @returns The rows to render, in document order.
 */
export function flattenTree (root: DomTreeNodeView, expanded: ReadonlySet<string>, query = '', showHidden = false): FlatTreeRow[] {
  const needle = query.trim().toLowerCase()

  return needle === '' ? flattenExpanded(root, expanded, 0, showHidden) : flattenFiltered(root, needle, 0, showHidden).rows
}

function flattenExpanded (node: DomTreeNodeView, expanded: ReadonlySet<string>, depth: number, showHidden: boolean): FlatTreeRow[] {
  if (!showHidden && node.hidden) return []
  const isExpanded = expanded.has(node.nodeId)
  const row: FlatTreeRow = { key: node.nodeId, node, depth, hasChildren: node.children.length > 0, expanded: isExpanded }
  if (!isExpanded) return [row]

  return [row, ...node.children.flatMap(child => flattenExpanded(child, expanded, depth + 1, showHidden))]
}

/** Depth-first, bottom-up: a node's rows are included, force-expanded, when it matches or any descendant does. */
function flattenFiltered (node: DomTreeNodeView, needle: string, depth: number, showHidden: boolean): { rows: FlatTreeRow[], matched: boolean } {
  if (!showHidden && node.hidden) return { rows: [], matched: false }
  const childResults = node.children.map(child => flattenFiltered(child, needle, depth + 1, showHidden))
  const childMatched = childResults.some(result => result.matched)
  if (!childMatched && !matchesQuery(node, needle)) return { rows: [], matched: false }
  const row: FlatTreeRow = { key: node.nodeId, node, depth, hasChildren: node.children.length > 0, expanded: true }

  return { rows: [row, ...childResults.flatMap(result => result.rows)], matched: true }
}

/** Whether a node's tag, id, classes, text or attribute values contain `needle` (already lower-cased). */
function matchesQuery (node: DomTreeNodeView, needle: string): boolean {
  if (node.tag.toLowerCase().includes(needle)) return true
  if (node.id?.toLowerCase().includes(needle) === true) return true
  if (node.classes?.some(token => token.toLowerCase().includes(needle)) === true) return true
  if (node.text?.toLowerCase().includes(needle) === true) return true

  return Object.values(node.attributes).some(value => value.toLowerCase().includes(needle))
}
