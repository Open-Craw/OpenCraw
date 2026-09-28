import { useEffect, useRef } from 'react'
import { Box, Text } from '@chakra-ui/react'
import type { DomTreeNodeView } from '@opencraw/studio'

/** What the tree's right-click menu can choose (studio plan §3.3, issue #93): a plain `take` override, or "regex on its text" — a second `kind: "regex"` card reading the node's own text, `from` a first `take: "text"` card. */
export type NodeMenuChoice = { kind: 'take', take: string } | { kind: 'regex' }

export interface NodeContextMenuProps {
  node:     DomTreeNodeView
  x:        number
  y:        number
  onClose:  () => void
  onChoose: (choice: NodeMenuChoice) => void
}

/** The tree's right-click menu: read as text, as html, as json, as one of the node's own attributes, or as a regex on its text (issue #93). A plain positioned popup, not Chakra's Menu primitive — this app has no other anchor-triggered menu yet to share its setup with. */
export function NodeContextMenu ({ node, x, y, onClose, onChoose }: NodeContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const attributes = Object.keys(node.attributes)

  return (
    <Box
      ref={ref}
      position='fixed'
      top={`${y}px`}
      left={`${x}px`}
      zIndex={1000}
      bg='bg.panel'
      borderWidth='1px'
      borderRadius='md'
      boxShadow='lg'
      py={1}
      minW='190px'
      fontSize='sm'
    >
      <MenuItem label='Read as text' onClick={() => { onChoose({ kind: 'take', take: 'text' }) }} />
      <MenuItem label='Read as html' onClick={() => { onChoose({ kind: 'take', take: 'html' }) }} />
      <MenuItem label='Read as json' onClick={() => { onChoose({ kind: 'take', take: 'json' }) }} />
      {attributes.length > 0 && (
        <Box borderTopWidth='1px' mt={1} pt={1}>
          <Text px={3} py='2px' fontSize='xs' color='fg.muted'>As an attribute</Text>
          {attributes.map(name => (
            <MenuItem key={name} label={name} onClick={() => { onChoose({ kind: 'take', take: `attr:${name}` }) }} />
          ))}
        </Box>
      )}
      <Box borderTopWidth='1px' mt={1} pt={1}>
        <MenuItem label='Regex on its text…' onClick={() => { onChoose({ kind: 'regex' }) }} />
      </Box>
    </Box>
  )
}

function MenuItem ({ label, onClick }: { label: string, onClick: () => void }): React.ReactElement {
  return (
    <Text as='button' display='block' w='full' textAlign='left' px={3} py='4px' _hover={{ bg: 'bg.emphasized' }} onClick={onClick}>
      {label}
    </Text>
  )
}
