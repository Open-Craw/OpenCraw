import { cachedSnapshot } from '../page-snapshot'
import { bestCandidate, candidatesFor, inferList, pathToNode, ShadowDomUnsupportedError, takeKindFor } from '../selector-inference'
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

  if (pathB === undefined) return { kind: 'field', field: fieldPick(html, pathA) }

  try {
    const result = inferList(pathA, pathB)
    if (result === null) return { kind: 'unsupported', reason: 'these two picks do not belong to the same list: pick the same field on two similar items' }
    const item = bestCandidate(html, candidatesFor(result.itemPath, false))
    if (item === undefined) return { kind: 'unsupported', reason: 'no selector matches every item of this list; try picking two items closer to each other in the markup' }
    const field = fieldPick(html, result.fieldPathA, result.fieldPath)

    return { kind: 'list', item: { selector: item.selector, tier: item.tier, matches: item.matches }, field }
  } catch (error) {
    if (error instanceof ShadowDomUnsupportedError) return { kind: 'unsupported', reason: error.message }
    throw error
  }
}

/** The best selector for one clicked node, `take` decided from the concrete clicked element; `rankSource` (a generalised path) is used for candidate generation when given, so a per-item-unique attribute of the one node picked cannot end up in the selector. */
function fieldPick (html: string, clicked: DomPath, rankSource: DomPath = clicked): FieldPick {
  const leaf = clicked.at(-1)
  const take = leaf === undefined ? 'text' : takeKindFor(leaf)
  const best = bestCandidate(html, candidatesFor(rankSource))
  if (best === undefined) throw new Error('no selector matches the picked node — this should not happen, since the node came from this same document')

  return { selector: best.selector, tier: best.tier, take, matches: best.matches }
}
