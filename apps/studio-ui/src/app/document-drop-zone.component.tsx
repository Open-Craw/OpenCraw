import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Box, Text } from '@chakra-ui/react'
import type { BoxProps } from '@chakra-ui/react'

/** Whether the drag carries a file at all — text and links dragged across the window are nothing to catch. */
function hasFiles (event: DragEvent): boolean {
  return [...event.dataTransfer.types].includes('Files')
}

/** Accepting the drag (the default is to refuse it), shown as a copy — nothing moves off the person's disk. */
function onDragOver (event: DragEvent): void {
  if (!hasFiles(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

export interface DocumentDropZoneProps extends BoxProps {
  /** A file was dropped anywhere over the zone: the first one, when several. */
  onFile:   (file: File) => void
  children: ReactNode
}

/**
 * Makes its whole area a drop target for a document (issue #120): while a
 * file is dragged over it, an overlay says what dropping does; the drop
 * hands the file to `onFile` (the import flow). Dragging anything that is
 * not a file (text, a link) is ignored. Children render as usual, so the
 * shell's layout props pass straight through.
 */
export function DocumentDropZone ({ onFile, children, ...boxProps }: DocumentDropZoneProps) {
  // Enter/leave fire for every child element crossed; a depth counter is what tells "left the zone" from "moved over a child".
  const [depth, setDepth] = useState(0)
  const dragging = depth > 0

  function onDragEnter (event: DragEvent): void {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDepth(current => current + 1)
  }

  function onDragLeave (event: DragEvent): void {
    if (!hasFiles(event)) return
    setDepth(current => Math.max(0, current - 1))
  }

  function onDrop (event: DragEvent): void {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDepth(0)
    const file = event.dataTransfer.files[0]
    if (file !== undefined) onFile(file)
  }

  return (
    <Box position='relative' data-testid='document-drop-zone' onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} {...boxProps}>
      {children}
      {dragging && (
        <Box
          role='status'
          position='absolute'
          inset={0}
          zIndex='overlay'
          display='flex'
          alignItems='center'
          justifyContent='center'
          bg='blue.subtle/80'
          borderWidth='3px'
          borderStyle='dashed'
          borderColor='blue.solid'
          pointerEvents='none'
        >
          <Text fontSize='lg' fontWeight='semibold' color='blue.fg'>Drop to start a recipe from this file</Text>
        </Box>
      )}
    </Box>
  )
}
