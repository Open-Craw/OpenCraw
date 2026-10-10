import { useRef } from 'react'
import { Button, HStack, Input, NativeSelect, Text } from '@chakra-ui/react'
import type { RecipeListing } from '@opencraw/studio'
import { NewRecipeDialog } from './new-recipe-dialog.component'

/** What "Open document…" offers: every format the engine reads off disk (core's `formatOfFile`), as the file picker's filter. */
const DOCUMENT_EXTENSIONS = '.pdf,.xlsx,.xls,.csv,.tsv,.pptx,.docx,.md,.markdown,.html,.htm,.json,.jsonl,.yaml,.yml,.xml'

export interface ToolbarProps {
  folder:            string
  onFolderChange:    (folder: string) => void
  onOpen:            () => void
  /** Set in the desktop app: the native folder dialog. The folder box and "Open" give way to "Open folder…". */
  onChooseFolder?:   () => void
  /** The folder a workspace is actually open on, for "+ New recipe" — `undefined` before one is opened (nothing to write into yet). */
  openFolder?:       string
  inputs:            RecipeListing[]
  selectedRecipeId?: string
  onSelectRecipe:    (recipeId: string) => void
  /** A new recipe pair was created and saved: select it, the same as picking it from the list below. */
  onRecipeCreated:   (recipeId: string) => void
  /** "Open document…" picked a file: start a recipe from it (issue #120, the same flow as dropping it on the shell). */
  onImportFile:      (file: File) => void
  /** A document import is in progress: the button shows it and refuses a second one meanwhile. */
  importing:         boolean
  running:           boolean
  onRunSample:       () => void
  onStop:            () => void
}

/** The last segment of a folder path, for showing next to the button; the whole path is its tooltip. */
function folderName (path: string): string {
  return /[^/\\]+(?=[/\\]*$)/u.exec(path)?.[0] ?? ''
}

/** The shell's toolbar: the workspace folder, a recipe picker, "+ New recipe", "Open document…", and Run sample / Stop. */
export function Toolbar ({ folder, onFolderChange, onOpen, onChooseFolder, openFolder, inputs, selectedRecipeId, onSelectRecipe, onRecipeCreated, onImportFile, importing, running, onRunSample, onStop }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <HStack gap={2} p={2} borderBottomWidth='1px' wrap='wrap'>
      <Text fontWeight='semibold' flexShrink={0}>OpenCraw Studio</Text>
      {onChooseFolder === undefined
        ? (
            <>
              <Input
                size='sm'
                flex='1 1 8em'
                minW='8em'
                maxW='24em'
                placeholder='recipe folder'
                value={folder}
                onChange={event => { onFolderChange(event.target.value) }}
                onKeyDown={event => { if (event.key === 'Enter') onOpen() }}
              />
              <Button size='sm' onClick={onOpen}>Open</Button>
            </>
          )
        : (
            <>
              <Button size='sm' onClick={onChooseFolder}>Open folder…</Button>
              <Text fontSize='sm' color='fg.muted' truncate maxW='16em' title={openFolder ?? folder}>{folderName(openFolder ?? folder)}</Text>
            </>
          )}
      <NativeSelect.Root size='sm' flex='1 1 8em' minW='8em' maxW='16em' disabled={inputs.length === 0}>
        <NativeSelect.Field
          value={selectedRecipeId ?? ''}
          onChange={event => { onSelectRecipe(event.target.value) }}
        >
          <option value='' disabled>{inputs.length === 0 ? 'no input recipes' : 'select a recipe'}</option>
          {inputs.map(input => <option key={input.file} value={input.id ?? input.file}>{input.id ?? input.file}</option>)}
        </NativeSelect.Field>
      </NativeSelect.Root>
      <NewRecipeDialog folder={openFolder} onCreated={onRecipeCreated} />
      <Button size='sm' variant='outline' onClick={() => { fileInputRef.current?.click() }} disabled={importing} loading={importing} title='Start a recipe from a PDF, spreadsheet, deck, Word, CSV, JSON, YAML, XML or Markdown file (or drop one anywhere)'>
        Open document…
      </Button>
      <input
        ref={fileInputRef}
        type='file'
        accept={DOCUMENT_EXTENSIONS}
        aria-label='Open document'
        hidden
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = '' // so picking the same file again still fires a change
          if (file !== undefined) onImportFile(file)
        }}
      />
      <HStack gap={2} flexShrink={0}>
        <Button size='sm' colorPalette='blue' onClick={onRunSample} disabled={selectedRecipeId === undefined || running} loading={running}>
          Run sample
        </Button>
        <Button size='sm' variant='outline' onClick={onStop} disabled={!running}>
          Stop
        </Button>
      </HStack>
    </HStack>
  )
}
