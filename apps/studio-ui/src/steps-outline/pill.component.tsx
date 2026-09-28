import { Text } from '@chakra-ui/react'
import { hashColor } from './hash-color'

/** The drag payload's MIME type for a pill dragged from the Steps tab onto a Record tab row (issue #92's mapping-by-drag): the id's name, nothing else — the drop target looks it up in its own scope, the same way the dropdown alternative does. */
export const PILL_DRAG_MIME = 'application/x-opencraw-pill'

/** One bound id or built-in, coloured by a stable hash of its name (see `hash-color.ts`). Draggable by default (studio plan §4.2: dragging a pill from a Steps card onto a Record row maps that field); pass `draggable={false}` for a pill shown somewhere dragging makes no sense. */
export function Pill ({ name, draggable = true }: { name: string, draggable?: boolean }) {
  const onDragStart = draggable
    ? (event: React.DragEvent<HTMLSpanElement>): void => {
        event.dataTransfer.setData(PILL_DRAG_MIME, name)
        event.dataTransfer.setData('text/plain', name)
        event.dataTransfer.effectAllowed = 'copy'
      }
    : undefined

  return (
    <Text
      as='span'
      display='inline-block'
      px={2}
      py='1px'
      borderRadius='full'
      fontSize='xs'
      fontWeight='medium'
      color='white'
      bg={hashColor(name)}
      draggable={draggable}
      cursor={draggable ? 'grab' : undefined}
      onDragStart={onDragStart}
    >
      {name}
    </Text>
  )
}
