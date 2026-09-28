import { load } from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import { NODE_ID_ATTRIBUTE } from '@opencraw/core'
import { HIDDEN_ATTRIBUTE } from '../page-snapshot'

/** A leaf element's own text longer than this is cut, with an ellipsis. */
const TEXT_LIMIT = 80
/** Consecutive siblings whose subtree is identical (ids aside) collapse into one row once there are at least this many — a real page can have tens of thousands of `<li>`s, and showing all of them is not "inspecting" it (issue #93). */
const MIN_REPEAT_RUN = 3

/** One row of the Inspect panel's DOM tree (studio plan §3.3, issue #93): a snapshot element, or a collapsed run of identical siblings. */
export interface DomTreeNode {
  /** The snapshot's own `data-oc-node` id — what a pick addresses. Present on every real element; absent only on the synthetic wrapper a collapsed run never needs (a run always keeps its first member's id here). */
  nodeId:         string
  tag:            string
  id?:            string
  classes?:       string[]
  /** Every other attribute (the internal `data-oc-node`/`data-oc-hidden` marks stripped). */
  attributes:     Record<string, string>
  /** This element's own text, trimmed and cut to `TEXT_LIMIT`, when it has no element children (mixed element+text content shows only the element children — see this file's `buildNode`). */
  text?:          string
  /** From the snapshot's `data-oc-hidden` mark (`hidden-marks.algorithm.ts`, phase 2). */
  hidden:         boolean
  children:       DomTreeNode[]
  /** Set when this row stands for a run of `repeatCount` structurally identical consecutive siblings (same tag, attributes and subtree — ids aside): the issue's `×20`. `repeatNodeIds` carries every collapsed sibling's own id, so a pick still knows every node the row represents. */
  repeatCount?:   number
  repeatNodeIds?: string[]
}

/**
 * Builds the Inspect panel's DOM tree from a captured snapshot (studio plan
 * §3.3, issue #93): the same rewritten, marked-up document the content pane's
 * iframe shows (`page-snapshot`'s `take-snapshot.use-case.ts`), so a tree
 * row's `nodeId` addresses exactly the element the iframe would highlight —
 * no separate capture, per issue #93's scope note to reuse phase 2's
 * snapshot rather than recapture.
 *
 * @param snapshotHtml - The cached, rewritten snapshot (`SnapshotResult.html`).
 * @returns The tree's root (the document's `<html>` element).
 * @throws Error when the document has no `<html>` element (should not happen: `rewriteDocument` always produces one).
 */
export function domTree (snapshotHtml: string): DomTreeNode {
  const $ = load(snapshotHtml)
  const html = $('html').get(0)
  if (html === undefined) throw new Error('domTree: the snapshot has no <html> element')

  return buildNode($, html)
}

function buildNode ($: CheerioAPI, element: Element): DomTreeNode {
  const $el = $(element)
  const attributes = { ...element.attribs }
  const nodeId = attributes[NODE_ID_ATTRIBUTE] ?? ''
  const hidden = attributes[HIDDEN_ATTRIBUTE] === '1'
  delete attributes[NODE_ID_ATTRIBUTE]
  delete attributes[HIDDEN_ATTRIBUTE]
  const id = attributes.id
  const classes = (attributes.class ?? '').split(/\s+/).filter(token => token !== '')

  const childElements = $el.children().toArray()
  const children = collapseRepeats(childElements.map(child => buildNode($, child)))
  const text = childElements.length === 0 ? abbreviate($el.text()) : undefined

  return {
    nodeId,
    tag: element.tagName.toLowerCase(),
    ...(id !== undefined && id !== '' && { id }),
    ...(classes.length > 0 && { classes }),
    attributes,
    ...(text !== undefined && text !== '' && { text }),
    hidden,
    children,
  }
}

/**
 * Merges runs of `MIN_REPEAT_RUN` or more consecutive siblings whose subtree
 * is identical (their own `nodeId`s aside) into one representative row, the
 * issue's `×20` — real pages have tens of thousands of nodes, and this is
 * what makes the tree usable rather than merely correct.
 *
 * @param nodes - Already-built sibling rows, in document order.
 * @returns The same rows, with each long-enough identical run replaced by one.
 */
function collapseRepeats (nodes: readonly DomTreeNode[]): DomTreeNode[] {
  const result: DomTreeNode[] = []
  let at = 0
  while (at < nodes.length) {
    const signature = signatureOf(nodes[at])
    let end = at + 1
    while (end < nodes.length && signatureOf(nodes[end]) === signature) end += 1
    const run = nodes.slice(at, end)
    if (run.length >= MIN_REPEAT_RUN) {
      result.push({ ...run[0], repeatCount: run.length, repeatNodeIds: run.map(node => node.nodeId) })
    } else {
      result.push(...run)
    }
    at = end
  }

  return result
}

/** A run member's identity for collapsing: everything but its own `nodeId` (every instance has a different one by construction). */
function signatureOf (node: DomTreeNode): string {
  return JSON.stringify({ ...node, nodeId: undefined, children: node.children.map(child => signatureOf(child)) })
}

function abbreviate (text: string): string {
  const trimmed = text.trim().replaceAll(/\s+/g, ' ')

  return trimmed.length > TEXT_LIMIT ? `${trimmed.slice(0, TEXT_LIMIT)}…` : trimmed
}
