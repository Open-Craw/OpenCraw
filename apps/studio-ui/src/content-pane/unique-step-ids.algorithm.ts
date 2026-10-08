import type { OutlineNode } from '@opencraw/studio'

/**
 * Renames the step ids and loop aliases of freshly picked nodes that would
 * clash with a name the recipe already binds (issue #132): the engine rejects
 * `id "table" is already bound on this path`, and a pick only ever proposes
 * the same default (`value`, `table`, `items`, `item`).
 *
 * A clashing name gets the first free `-2`, `-3`… suffix. References inside
 * the same picked node (`over`, `from`) follow their rename, so a picked list
 * keeps pointing at its own items. Names the picked nodes do not define are
 * left alone.
 *
 * @param existing - The nodes already in the recipe that stay (a node being replaced is left out by the caller).
 * @param incoming - The picked top-level nodes, in insertion order.
 * @returns The picked nodes with unique names; untouched nodes are returned as they were.
 */
export function withUniqueStepIds (existing: readonly OutlineNode[], incoming: readonly OutlineNode[]): OutlineNode[] {
  const taken = new Set<string>()
  for (const node of existing) collectNames(node, taken)

  // Renames made by earlier nodes of this batch: a later node (a `forEach`) reads what an earlier one (its items `extract`) defined.
  const earlier = new Map<string, string>()

  return incoming.map((node) => {
    const own = new Set<string>()
    collectNames(node, own)
    const renames = new Map<string, string>()
    for (const name of own) {
      if (!taken.has(name)) continue
      let counter = 2
      while (taken.has(`${name}-${counter}`) || own.has(`${name}-${counter}`)) counter++
      renames.set(name, `${name}-${counter}`)
    }
    for (const [name, renamedTo] of renames) earlier.set(name, renamedTo)
    const renamed = renames.size === 0 && earlier.size === 0 ? node : rename(node, renames, earlier)
    collectNames(renamed, taken)

    return renamed
  })
}

function collectNames (node: OutlineNode, into: Set<string>): void {
  for (const key of ['id', 'as'] as const) {
    const value = node.step[key]
    if (typeof value === 'string') into.add(value)
  }
  if (node.kind === 'bracket') {
    for (const child of node.children) collectNames(child, into)
    const elseChildren = node.elseChildren ?? []
    for (const child of elseChildren) collectNames(child, into)
  }
}

/** `defined` renames the names this node defines (`id`, `as`); `references` renames the names it reads (`over`, `from`), which may come from an earlier node. */
function rename (node: OutlineNode, defined: ReadonlyMap<string, string>, references: ReadonlyMap<string, string>): OutlineNode {
  const step: Record<string, unknown> = { ...node.step }
  for (const key of ['id', 'as'] as const) {
    const value = step[key]
    if (typeof value === 'string' && defined.has(value)) step[key] = defined.get(value)
  }
  for (const key of ['over', 'from'] as const) {
    const value = step[key]
    if (typeof value === 'string' && references.has(value)) step[key] = references.get(value)
  }
  if (node.kind === 'card') return { ...node, step }

  return {
    ...node,
    step,
    children: node.children.map(child => rename(child, defined, references)),
    ...(node.elseChildren !== undefined && { elseChildren: node.elseChildren.map(child => rename(child, defined, references)) }),
  }
}
