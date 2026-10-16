import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Box } from '@chakra-ui/react'
import type { OutlineNode } from '@opencraw/studio'
import { CARD_DRAG_MIME, PILL_DRAG_MIME, droppedCard } from '../steps-outline'

export interface OutputDropZoneProps {
  /** A pill (a value the steps read) was dropped: add it as an output field. */
  onPill:   (id: string) => void
  /** A selection from the content pane was dropped: add it to the steps and its values as output fields. */
  onCard:   (node: OutlineNode) => void
  children: ReactNode
}

function carries (event: DragEvent): boolean {
  const types = new Set(event.dataTransfer.types)

  return types.has(PILL_DRAG_MIME) || types.has(CARD_DRAG_MIME)
}

/**
 * The Record tab's list as a drop target: a pill dragged from a Steps card, or
 * a selection dragged from the content pane, becomes an output field (and its
 * mapping) by being dropped anywhere on it. A row's own source box handles a
 * pill dropped on it first (it marks the drop handled), so that still maps
 * that one field instead of adding another.
 */
export function OutputDropZone ({ onPill, onCard, children }: OutputDropZoneProps) {
  const [over, setOver] = useState(false)

  function dragOver (event: DragEvent): void {
    if (event.defaultPrevented || !carries(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setOver(true)
  }

  function drop (event: DragEvent): void {
    setOver(false)
    if (event.defaultPrevented || !carries(event)) return
    event.preventDefault()
    const card = droppedCard(event.dataTransfer)
    if (card !== undefined) {
      onCard(card)

      return
    }
    const id = event.dataTransfer.getData(PILL_DRAG_MIME)
    if (id !== '') onPill(id)
  }

  return (
    <Box
      data-testid='output-drop-zone'
      data-drop-over={over}
      borderWidth='2px'
      borderStyle='dashed'
      borderColor={over ? 'brand.solid' : 'transparent'}
      bg={over ? 'brand.subtle' : undefined}
      borderRadius='md'
      minH='4em'
      flexShrink={0}
      onDragOver={dragOver}
      onDragLeave={() => { setOver(false) }}
      onDrop={drop}
    >
      {children}
    </Box>
  )
}
