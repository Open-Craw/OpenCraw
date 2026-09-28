import { Badge, Box, HStack, Text } from '@chakra-ui/react'
import type { FlatTreeRow } from './flatten-tree.mapper'

export interface TreeRowProps {
  row:             FlatTreeRow
  /** A pill's colour, when this node matches a bound id's selector — the issue's "picked nodes highlighted in their pill's colour". */
  highlightColor?: string
  hovered:         boolean
  onToggle:        () => void
  onHover:         (hovering: boolean) => void
  onClick:         () => void
  onContextMenu:   (event: React.MouseEvent) => void
}

const ATTRIBUTES_SHOWN = 3

/** One row of the Inspect panel's DOM tree (studio plan §3.3, issue #93): tag, id, classes and a few attributes, text abbreviated, `×N` on a collapsed repeat run, hidden nodes greyed. */
export function TreeRow ({ row, highlightColor, hovered, onToggle, onHover, onClick, onContextMenu }: TreeRowProps): React.ReactElement {
  const { node, depth, hasChildren, expanded } = row
  const attributeEntries = Object.entries(node.attributes).slice(0, ATTRIBUTES_SHOWN)
  const moreAttributes = Object.keys(node.attributes).length - attributeEntries.length

  return (
    <HStack
      gap={1}
      pl={`${depth * 14 + 4}px`}
      pr={2}
      h='22px'
      fontSize='xs'
      fontFamily='mono'
      opacity={node.hidden ? 0.5 : 1}
      bg={hovered ? 'bg.emphasized' : undefined}
      style={highlightColor === undefined ? undefined : { boxShadow: `inset 3px 0 0 ${highlightColor}` }}
      cursor='pointer'
      whiteSpace='nowrap'
      overflow='hidden'
      onMouseEnter={() => { onHover(true) }}
      onMouseLeave={() => { onHover(false) }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {hasChildren
        ? (
            <Text
              as='button'
              w='12px'
              flexShrink={0}
              color='fg.muted'
              onClick={(event) => { event.stopPropagation(); onToggle() }}
            >
              {expanded ? '▾' : '▸'}
            </Text>
          )
        : <Box w='12px' flexShrink={0} />}
      <Text as='span' color='purple.fg'>{`<${node.tag}`}</Text>
      {node.id !== undefined && <Text as='span' color='blue.fg'>{`#${node.id}`}</Text>}
      {node.classes?.map(token => <Text as='span' key={token} color='teal.fg'>{`.${token}`}</Text>)}
      {attributeEntries.map(([name, value]) => <Text as='span' key={name} color='fg.muted'>{`${name}="${value}"`}</Text>)}
      {moreAttributes > 0 && <Text as='span' color='fg.muted'>{`…+${moreAttributes}`}</Text>}
      <Text as='span' color='purple.fg'>{'>'}</Text>
      {node.text !== undefined && node.text !== '' && <Text as='span' color='fg.muted' truncate>{node.text}</Text>}
      {node.repeatCount !== undefined && <Badge size='xs' colorPalette='gray'>{`×${node.repeatCount}`}</Badge>}
    </HStack>
  )
}
