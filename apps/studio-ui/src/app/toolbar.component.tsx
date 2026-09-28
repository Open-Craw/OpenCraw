import { Button, HStack, Input, NativeSelect, Text } from '@chakra-ui/react'
import type { RecipeListing } from '@opencraw/studio'

export interface ToolbarProps {
  folder:            string
  onFolderChange:    (folder: string) => void
  onOpen:            () => void
  inputs:            RecipeListing[]
  selectedRecipeId?: string
  onSelectRecipe:    (recipeId: string) => void
  running:           boolean
  onRunSample:       () => void
  onStop:            () => void
}

/** The shell's toolbar: the workspace folder, a recipe picker, and Run sample / Stop. */
export function Toolbar ({ folder, onFolderChange, onOpen, inputs, selectedRecipeId, onSelectRecipe, running, onRunSample, onStop }: ToolbarProps) {
  return (
    <HStack gap={2} p={2} borderBottomWidth='1px' wrap='wrap'>
      <Text fontWeight='semibold' flexShrink={0}>OpenCraw Studio</Text>
      <Input
        size='sm'
        maxW='24em'
        placeholder='recipe folder'
        value={folder}
        onChange={event => { onFolderChange(event.target.value) }}
        onKeyDown={event => { if (event.key === 'Enter') onOpen() }}
      />
      <Button size='sm' onClick={onOpen}>Open</Button>
      <NativeSelect.Root size='sm' maxW='16em' disabled={inputs.length === 0}>
        <NativeSelect.Field
          value={selectedRecipeId ?? ''}
          onChange={event => { onSelectRecipe(event.target.value) }}
        >
          <option value='' disabled>{inputs.length === 0 ? 'no input recipes' : 'select a recipe'}</option>
          {inputs.map(input => <option key={input.file} value={input.id ?? input.file}>{input.id ?? input.file}</option>)}
        </NativeSelect.Field>
      </NativeSelect.Root>
      <Button size='sm' colorPalette='blue' onClick={onRunSample} disabled={selectedRecipeId === undefined || running} loading={running}>
        Run sample
      </Button>
      <Button size='sm' variant='outline' onClick={onStop} disabled={!running}>
        Stop
      </Button>
    </HStack>
  )
}
