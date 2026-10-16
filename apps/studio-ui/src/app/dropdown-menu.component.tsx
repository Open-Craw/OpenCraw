import { useEffect, useRef, useState } from 'react'
import { Box, Button } from '@chakra-ui/react'

export interface DropdownItem {
  /** What the item is called, and what it is found by. */
  label:     string
  onSelect:  () => void
  disabled?: boolean
  /** A heading drawn above this item, to group the list. */
  heading?:  string
  /** A rule drawn above this item. */
  divider?:  boolean
}

export interface DropdownMenuProps {
  /** The button's text, the arrow included. */
  label:     string
  title?:    string
  disabled?: boolean
  loading?:  boolean
  items:     DropdownItem[]
}

/**
 * A button that opens a short list under it: a plain popover of buttons rather
 * than a menu library, which keeps the toolbar free of an extra dependency and
 * behaves the same in the browser, the desktop app and the test DOM. Closes on
 * a choice, Escape or a click anywhere else.
 */
export function DropdownMenu ({ label, title, disabled, loading, items }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false)

        return
      }
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)

    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <Box ref={rootRef} position='relative' flexShrink={0}>
      <Button size='sm' variant='outline' maxW='16em' title={title} disabled={disabled} loading={loading} aria-haspopup='menu' aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        <Box as='span' display='block' truncate maxW='15em' title={label}>{label}</Box>
      </Button>
      {open && (
        <Box role='menu' position='absolute' top='100%' left={0} mt={1} zIndex='dropdown' minW='14em' py={1} bg='bg' borderWidth='1px' borderRadius='md' boxShadow='md'>
          {items.map(item => (
            <Box key={item.label}>
              {item.divider === true && <Box borderTopWidth='1px' my={1} />}
              {item.heading !== undefined && <Box px={3} py={1} fontSize='xs' color='fg.muted'>{item.heading}</Box>}
              <Box
                as='button'
                role='menuitem'
                display='block'
                w='full'
                textAlign='left'
                px={3}
                py={1}
                fontSize='sm'
                cursor={item.disabled === true ? 'not-allowed' : 'pointer'}
                opacity={item.disabled === true ? 0.5 : 1}
                _hover={item.disabled === true ? undefined : { bg: 'bg.muted' }}
                aria-disabled={item.disabled === true}
                onClick={() => {
                  if (item.disabled === true) return
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
