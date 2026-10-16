import { Button, HStack } from '@chakra-ui/react'
import type { Zoom } from './zoom.hook'

/** − / percentage / + for the content pane: the percentage resets to 100%. */
export function ZoomControls ({ zoom, zoomIn, zoomOut, reset }: Zoom) {
  return (
    <HStack gap={0} role='group' aria-label='Zoom' flexShrink={0}>
      <Button size='2xs' variant='outline' aria-label='Zoom out' title='Zoom out (ctrl + wheel)' onClick={zoomOut}>−</Button>
      <Button size='2xs' variant='outline' aria-label='Reset zoom' title='Back to 100%' minW='3.5em' onClick={reset}>{`${String(Math.round(zoom * 100))}%`}</Button>
      <Button size='2xs' variant='outline' aria-label='Zoom in' title='Zoom in (ctrl + wheel)' onClick={zoomIn}>+</Button>
    </HStack>
  )
}
