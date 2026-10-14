import { useState } from 'react'
import { Button, CloseButton, Dialog, Field, Input, Portal } from '@chakra-ui/react'
import { startUrlError } from './new-recipe.mapper'

export interface LoadUrlDialogProps {
  open:    boolean
  onClose: () => void
  /** A valid http(s) address was entered. */
  onLoad:  (url: string) => void
}

/** "Load ▾ URL…": asks for the page address (blank is not accepted: there is nothing to load). */
export function LoadUrlDialog ({ open, onClose, onLoad }: LoadUrlDialogProps) {
  const [url, setUrl] = useState('')
  const problem = url.trim() === '' ? undefined : startUrlError(url)
  const ready = url.trim() !== '' && problem === undefined

  function close (): void {
    setUrl('')
    onClose()
  }

  function submit (): void {
    if (!ready) return
    onLoad(url.trim())
    close()
  }

  return (
    <Dialog.Root open={open} onOpenChange={details => { if (!details.open) close() }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header display='flex' flexDirection='row' alignItems='center' justifyContent='space-between'>
              <Dialog.Title>Load a web page</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size='sm' aria-label='Close' />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body display='flex' flexDirection='column' gap={3} pb={4}>
              <Field.Root invalid={problem !== undefined}>
                <Field.Label>Page address</Field.Label>
                <Input
                  size='sm'
                  placeholder='https://example.com/books'
                  value={url}
                  onChange={event => { setUrl(event.target.value) }}
                  onKeyDown={event => { if (event.key === 'Enter') submit() }}
                />
                {problem !== undefined && <Field.ErrorText>{problem}</Field.ErrorText>}
                <Field.HelperText>Becomes the open recipe's start page, or a new recipe when none reads a web page.</Field.HelperText>
              </Field.Root>
              <Button size='sm' colorPalette='blue' alignSelf='flex-end' disabled={!ready} onClick={submit}>Load</Button>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
