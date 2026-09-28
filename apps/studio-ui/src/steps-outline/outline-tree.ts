import type { OutlineNode, OutlineView } from '@opencraw/studio'

/** Is this node a container (`forEach`/`paginate`/`if`) with its own nested lists? */
export function isBracket (node: OutlineNode): node is Extract<OutlineNode, { kind: 'bracket' }> {
  return node.kind === 'bracket'
}

/**
 * A list of steps the outline lets a `+` menu add to or a move button
 * reorder: the top level (`listId` `''`), or one bracket's `steps` or
 * `else` branch (`listId` `<bracket path>::then` / `<bracket path>::else`).
 */
export function listAt (outline: OutlineView, listId: string): OutlineNode[] {
  if (listId === '') return outline.steps

  const [path, branch] = listId.split('::', 2)
  const bracket = findBracket(outline.steps, path)
  if (bracket === undefined) return []

  return branch === 'else' ? bracket.elseChildren ?? [] : bracket.children
}

/** Replaces one list (see `listAt`) with a new one, everywhere else in the tree left as it is. */
export function withList (outline: OutlineView, listId: string, nodes: OutlineNode[]): OutlineView {
  if (listId === '') return { ...outline, steps: nodes }

  const [path, branch] = listId.split('::', 2)

  return { ...outline, steps: replaceList(outline.steps, path, branch, nodes) }
}

/** Replaces one node (by its own path) with `updater`'s result, wherever in the tree it sits. */
export function withNode (outline: OutlineView, path: string, updater: (node: OutlineNode) => OutlineNode): OutlineView {
  return { ...outline, steps: replaceNode(outline.steps, path, updater) }
}

function replaceList (nodes: OutlineNode[], bracketPath: string, branch: string, replacement: OutlineNode[]): OutlineNode[] {
  return nodes.map((node) => {
    if (!isBracket(node)) return node
    if (node.path === bracketPath) {
      return branch === 'else' ? { ...node, elseChildren: replacement } : { ...node, children: replacement }
    }

    return {
      ...node,
      children:     replaceList(node.children, bracketPath, branch, replacement),
      elseChildren: node.elseChildren === undefined ? undefined : replaceList(node.elseChildren, bracketPath, branch, replacement),
    }
  })
}

function replaceNode (nodes: OutlineNode[], path: string, updater: (node: OutlineNode) => OutlineNode): OutlineNode[] {
  return nodes.map((node) => {
    if (node.path === path) return updater(node)
    if (!isBracket(node)) return node

    return {
      ...node,
      children:     replaceNode(node.children, path, updater),
      elseChildren: node.elseChildren === undefined ? undefined : replaceNode(node.elseChildren, path, updater),
    }
  })
}

function findBracket (nodes: OutlineNode[], path: string): Extract<OutlineNode, { kind: 'bracket' }> | undefined {
  for (const node of nodes) {
    if (!isBracket(node)) continue
    if (node.path === path) return node
    const inChildren = findBracket(node.children, path)
    if (inChildren !== undefined) return inChildren
    if (node.elseChildren !== undefined) {
      const inElse = findBracket(node.elseChildren, path)
      if (inElse !== undefined) return inElse
    }
  }

  return undefined
}

/** The JSON-path prefix a new node inserted at `listId` gets (paired with its index): `steps` at the top level, `<bracket path>.steps`/`.else` nested. */
export function listPathPrefix (listId: string): string {
  if (listId === '') return 'steps'
  const [path, branch] = listId.split('::', 2)

  return `${path}.${branch === 'else' ? 'else' : 'steps'}`
}

/** Every issue whose path is this node's own path, or one of its own fields (not a descendant step's). */
export function issuesForNode (issues: readonly { path: string, message: string }[], path: string): { path: string, message: string }[] {
  return issues.filter((issue) => {
    if (issue.path === path) return true
    if (!issue.path.startsWith(`${path}.`)) return false
    const rest = issue.path.slice(path.length + 1)

    return !rest.startsWith('steps.') && !rest.startsWith('else.')
  })
}
