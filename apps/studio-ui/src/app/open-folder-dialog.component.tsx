import { Button, CloseButton, Dialog, HStack, Input, Portal, Text } from '@chakra-ui/react'

export interface OpenFolderDialogProps {
  open:           boolean
  onClose:        () => void
  folder:         string
  onFolderChange: (folder: string) => void
  /** The typed folder is confirmed. */
  onOpen:         () => void
  /** The server's folder dialog; absent when the server has none. */
  onBrowse?:      () => void
  browsing?:      boolean
}

/** "Recipe ▾ → Open folder…" in a browser: the folder to read recipes from, typed or picked in the operating system's dialog. The desktop app uses its own native dialog and never shows this. */
export function OpenFolderDialog ({ open, onClose, folder, onFolderChange, onOpen, onBrowse, browsing }: OpenFolderDialogProps) {
  function confirm (): void {
    if (folder.trim() === '') return
    onOpen()
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={details => { if (!details.open) onClose() }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header display='flex' flexDirection='row' alignItems='center' justifyContent='space-between'>
              <Dialog.Title>Open folder</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size='sm' aria-label='Close' />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body display='flex' flexDirection='column' gap={3} pb={4}>
              <Input
                size='sm'
                placeholder='recipe folder'
                value={folder}
                onChange={event => { onFolderChange(event.target.value) }}
                onKeyDown={event => { if (event.key === 'Enter') confirm() }}
              />
              <Text fontSize='xs' color='fg.muted'>
                A folder of <Text as='span' fontFamily='mono'>.ocw-in.json</Text> and <Text as='span' fontFamily='mono'>.ocw-out.json</Text> recipes, or an empty one to start in.
              </Text>
              <HStack justifyContent='flex-end'>
                {onBrowse !== undefined && (
                  <Button size='sm' variant='outline' onClick={onBrowse} disabled={browsing} loading={browsing} title='Pick the folder in the operating system dialog'>Browse…</Button>
                )}
                <Button size='sm' colorPalette='blue' onClick={confirm} disabled={folder.trim() === ''}>Open</Button>
              </HStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
