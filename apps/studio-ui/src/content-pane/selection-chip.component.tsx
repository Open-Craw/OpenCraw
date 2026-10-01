import { Button, CloseButton, HStack, Text } from '@chakra-ui/react'

/** The staged selection's outline colour, shared by the PDF and deck canvases' boxes and chips (issues #121, #122). */
export const REGION_COLOR = '#9b5de5'

export interface SelectionChipProps {
  left:        number
  top:         number
  /** What the engine reads in the box; `undefined` while the preview loads, or when nothing sits in the box. */
  text?:       string
  loading:     boolean
  onAdd:       () => void
  onClear:     () => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void
}

/**
 * The staged selection's own chip, just under its box (issues #121, #122):
 * the text the step will bind, "Add to recipe", and a handle to drag the
 * same card onto the Steps tab — the one chip the PDF and deck canvases
 * share, since a staged `region` reads the same way on both.
 */
export function SelectionChip ({ left, top, text, loading, onAdd, onClear, onDragStart }: SelectionChipProps): React.ReactElement {
  const empty = text === undefined && !loading
  const [firstLine = ''] = (text ?? '').split('\n', 1)

  return (
    <HStack
      data-testid='region-chip'
      position='absolute'
      style={{ left: `${String(left)}px`, top: `${String(top)}px` }}
      zIndex='docked'
      gap={2}
      px={2}
      py={1}
      bg='bg.panel'
      borderWidth='1px'
      borderColor={REGION_COLOR}
      borderRadius='md'
      shadow='md'
      maxW='420px'
      draggable={text !== undefined}
      onDragStart={onDragStart}
      cursor={text === undefined ? 'default' : 'grab'}
      title={text === undefined ? undefined : 'Drag onto the Steps tab to add it there'}
    >
      <Text fontSize='xs' fontFamily='mono' truncate flex='1' color={empty ? 'fg.muted' : 'fg'}>
        {loading && text === undefined ? 'reading…' : (empty ? 'nothing to read here' : firstLine)}
      </Text>
      <Button size='2xs' colorPalette='blue' onClick={onAdd} disabled={text === undefined}>Add to recipe</Button>
      <CloseButton size='2xs' aria-label='Clear selection' onClick={onClear} />
    </HStack>
  )
}
