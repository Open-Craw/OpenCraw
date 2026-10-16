import { load } from 'cheerio'
import { NODE_ID_ATTRIBUTE } from '@opencraw/core'
import { cachedSnapshot } from '../page-snapshot'
import { candidatesFor, inferList, isStableId, pathToNode, rankCandidates, ShadowDomUnsupportedError, takeKindFor } from '../selector-inference'
import type { RankedCandidate } from '../selector-inference'
import type { DomPath } from '../selector-inference'
import type { FieldPick, InferSelectorCommand, InferSelectorView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `infer-selector`: turns one or two picked nodes (their
 * `data-oc-node` ids, off the cached snapshot) into a verified selector —
 * one id for a `Read` card's field, two for the safe item+field list shape
 * `selector-inference`'s `inferList` builds by construction (issue #91,
 * studio plan §3.2). All the actual candidate/ranking/list-inference work
 * is `selector-inference`'s (pure); this handler only locates the clicked
 * nodes in the cached document and calls into it.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns A field pick, a list pick, or `"unsupported"` with why.
 * @throws Error when no workspace is open, or `command.path` has no cached snapshot yet.
 */
export function handleInferSelector (state: StudioState, command: InferSelectorCommand): InferSelectorView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  const html = snapshot.html
  const paths = command.nodeIds.map(nodeId => pathToNode(html, nodeId))
  if (paths.includes(undefined)) return { kind: 'unsupported', reason: 'one of the picked nodes is no longer in the snapshot; take a fresh snapshot and try again' }
  const [pathA, pathB] = paths as DomPath[]

  if (pathB === undefined) return itemField(html, command, pathA) ?? { kind: 'field', field: fieldPick(html, pathA, pathA, command.nodeIds[0]) }

  try {
    const result = inferList(pathA, pathB)
    if (result === null) return { kind: 'unsupported', reason: 'these two picks do not belong to the same list: pick the same field on two similar items' }
    const itemOptions = rankCandidates(html, candidatesFor(result.itemPath, false))
    const item = itemOptions[0]
    if (item === undefined) return { kind: 'unsupported', reason: 'no selector matches every item of this list; try picking two items closer to each other in the markup' }
    const field = fieldPick(html, result.fieldPathA, result.fieldPath)

    return { kind: 'list', item: { selector: item.selector, tier: item.tier, matches: item.matches, alternatives: alternativesOf(itemOptions) }, field }
  } catch (error) {
    if (error instanceof ShadowDomUnsupportedError) return { kind: 'unsupported', reason: error.message }
    throw error
  }
}

/**
 * A single pick inside an item of the list the recipe already loops over (`command.within` is the items' selector): the field read from the item,
 * for the loop's body. `undefined` when no list is given, or the node is not inside one of its items (or is the item itself).
 */
function itemField (html: string, command: InferSelectorCommand, clicked: DomPath): InferSelectorView | undefined {
  if (command.within === undefined) return undefined
  const $ = load(html)
  let itemId: string | undefined
  try {
    itemId = $(`[${NODE_ID_ATTRIBUTE}="${command.nodeIds[0]}"]`).first().closest(command.within).attr(NODE_ID_ATTRIBUTE)
  } catch {
    return undefined
  }
  const itemPath = itemId === undefined ? undefined : pathToNode(html, itemId)
  if (itemPath === undefined || itemPath.length >= clicked.length) return undefined

  return { kind: 'item-field', field: fieldPick(html, clicked.slice(itemPath.length - 1)) }
}

/** The best selector for one clicked node, `take` decided from the concrete clicked element; `rankSource` (a generalised path) is used for candidate generation when given, so a per-item-unique attribute of the one node picked cannot end up in the selector. */
function fieldPick (html: string, clicked: DomPath, rankSource: DomPath = clicked, targetNodeId?: string): FieldPick {
  const leaf = clicked.at(-1)
  const take = leaf === undefined ? 'text' : takeKindFor(leaf)
  const options = rankCandidates(html, candidatesFor(rankSource), targetNodeId)
  const best = options[0]
  if (best === undefined) throw new Error('no selector matches the picked node — this should not happen, since the node came from this same document')
  const generatedId = leaf?.id !== undefined && !isStableId(leaf.id) ? leaf.id : undefined

  return { selector: best.selector, tier: best.tier, take, matches: best.matches, alternatives: alternativesOf(options), ...(generatedId !== undefined && { generatedId }) }
}

/** How many other selectors a person is offered at most. */
const MAX_ALTERNATIVES = 6

/** The verified candidates as the options shown to the person: the ones that reach the clicked node, each selector once. */
function alternativesOf (options: readonly RankedCandidate[]): { selector: string, tier: RankedCandidate['tier'], matches: number }[] {
  const seen = new Set<string>()
  const alternatives: { selector: string, tier: RankedCandidate['tier'], matches: number }[] = []
  for (const option of options) {
    if (!option.hitsTarget || seen.has(option.selector)) continue
    seen.add(option.selector)
    alternatives.push({ selector: option.selector, tier: option.tier, matches: option.matches })
    if (alternatives.length === MAX_ALTERNATIVES) break
  }

  return alternatives
}
