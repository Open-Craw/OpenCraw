import type { OutlineNode } from '@opencraw/studio'

/**
 * What a card/bracket needs to change the outline: local, responsive edits
 * (`edit`, `commit`) plus structural changes that also save right away
 * (`move`, `remove`, `insert`) — see `steps-outline.tsx` for how these are
 * built and threaded down.
 */
export interface OutlineActions {
  /** Updates a node's `step` (and anything else about it) locally; typing stays responsive without saving on every keystroke. */
  edit:   (path: string, updater: (node: OutlineNode) => OutlineNode) => void
  /** Writes the outline through `save-outline`, once an edit is "done" (a field loses focus, a toggle flips). */
  commit: () => void
  /** Swaps a node with its neighbour within its own list, and saves. */
  move:   (listId: string, index: number, direction: -1 | 1) => void
  /** Removes a node from its list, and saves. */
  remove: (listId: string, index: number) => void
  /** Inserts a new step of `stepType` at `index` in a list, and saves. */
  insert: (listId: string, index: number, stepType: string) => void
}
