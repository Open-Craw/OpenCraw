import type { OutlineNode } from '@opencraw/studio'

/** The drag payload's MIME type for a whole outline node dragged onto the Steps tab (issue #121): a canvas's staged selection, carried as the card it would add — the drop appends it as "Add to recipe" would. */
export const CARD_DRAG_MIME = 'application/x-opencraw-card'

/** What a draggable chip puts on its `DataTransfer` under {@link CARD_DRAG_MIME}. */
export function cardDragData (node: OutlineNode): string {
  return JSON.stringify(node)
}

/**
 * The node a drop carries, when it carries one: the payload parsed back, or
 * `undefined` for a drag of anything else (a pill, a file, text).
 *
 * @param dataTransfer - The drop event's transfer.
 */
export function droppedCard (dataTransfer: DataTransfer): OutlineNode | undefined {
  const raw = dataTransfer.getData(CARD_DRAG_MIME)
  if (raw === '') return undefined
  try {
    const node = JSON.parse(raw) as Partial<OutlineNode>

    return node.kind === 'card' || node.kind === 'bracket' ? node as OutlineNode : undefined
  } catch {
    return undefined
  }
}

/** Whether a drag in flight carries a card at all — checked on dragover, before the payload itself is readable. */
export function carriesCard (dataTransfer: DataTransfer): boolean {
  return [...dataTransfer.types].includes(CARD_DRAG_MIME)
}
