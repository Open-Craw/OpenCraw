import { useRef, useState } from 'react'
import { Button, HStack, Text } from '@chakra-ui/react'
import type { RecipeListing } from '@opencraw/studio'
import { ColorModeToggle, StudioLogo } from '../appearance'
import { LoadUrlDialog, NewRecipeDialog } from '../recipe-start'
import type { BrowseOutcome } from './browse-folder.hook'
import { LoadMenu } from './load-menu.component'
import { OpenFolderDialog } from './open-folder-dialog.component'
import { RecipeMenu } from './recipe-menu.component'
import { SaveStatus } from './save-status.component'

/** What "Load ▾ Document…" offers: every format the engine reads off disk (core's `formatOfFile`), as the file picker's filter. */
const DOCUMENT_EXTENSIONS = '.pdf,.xlsx,.xlsm,.xls,.csv,.tsv,.pptx,.docx,.md,.markdown,.html,.htm,.json,.jsonl,.yaml,.yml,.xml'

export interface ToolbarProps {
  folder:            string
  onFolderChange:    (folder: string) => void
  onOpen:            () => void
  /** Set in the desktop app: the native folder dialog, used directly by "Open folder…". */
  onChooseFolder?:   () => void
  /** In a browser: the server's folder dialog, which "Open folder…" asks first; the typed box (also with a Browse… button) is the fallback when the server has none. */
  onBrowse?:         () => Promise<BrowseOutcome>
  /** The dialog is open, waiting for an answer. */
  browsing?:         boolean
  /** The folder a workspace is actually open on — `undefined` before one is opened (nothing to write into yet). */
  openFolder?:       string
  inputs:            RecipeListing[]
  selectedRecipeId?: string
  onSelectRecipe:    (recipeId: string) => void
  /** A new recipe pair was created and saved: select it, the same as picking it from the Recipe menu. */
  onRecipeCreated:   (recipeId: string) => void
  /** "Load ▾ Document…" picked a file (the same flow as dropping it on the shell). */
  onImportFile:      (file: File) => void
  /** "Load ▾ Web page…" confirmed an address. */
  onLoadUrl:         (url: string) => void
  /** A load is in progress: the Load button shows it and refuses a second one meanwhile. */
  importing:         boolean
  running:           boolean
  onRunSample:       () => void
  onStop:            () => void
  /** Forget the last run's records, trace and why, and any selection under way. */
  onClear:           () => void
}

/** The last segment of a folder path, for showing beside the menus; the whole path is its tooltip. */
function folderName (path: string): string {
  return /[^/\\]+(?=[/\\]*$)/u.exec(path)?.[0] ?? ''
}

/**
 * The shell's toolbar, three jobs and no more: **Recipe ▾** (which recipe is being edited: open, new, another
 * folder), **Load ▾** (what it reads: a document or a page), and Run sample / Stop; with a status that says edits
 * are saved as they are made.
 */
export function Toolbar ({ folder, onFolderChange, onOpen, onChooseFolder, onBrowse, browsing, openFolder, inputs, selectedRecipeId, onSelectRecipe, onRecipeCreated, onImportFile, onLoadUrl, importing, running, onRunSample, onStop, onClear }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newRecipeOpen, setNewRecipeOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)

  return (
    <HStack gap={2} p={2} borderBottomWidth='1px' wrap='wrap'>
      <StudioLogo />
      <RecipeMenu
        inputs={inputs}
        selectedRecipeId={selectedRecipeId}
        hasFolder={openFolder !== undefined}
        onSelectRecipe={onSelectRecipe}
        onNewRecipe={() => { setNewRecipeOpen(true) }}
        onOpenFolder={() => {
          if (onChooseFolder !== undefined) onChooseFolder()
          else if (onBrowse === undefined) setFolderOpen(true)
          else void onBrowse().then(outcome => { if (outcome === 'unavailable') setFolderOpen(true) })
        }}
      />
      <LoadMenu
        loading={importing}
        onLoadDocument={() => { fileInputRef.current?.click() }}
        onLoadUrl={() => { setUrlOpen(true) }}
      />
      <input
        ref={fileInputRef}
        type='file'
        accept={DOCUMENT_EXTENSIONS}
        aria-label='Load document'
        hidden
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = '' // so picking the same file again still fires a change
          if (file !== undefined) onImportFile(file)
        }}
      />
      {openFolder !== undefined && (
        <Text fontSize='sm' color='fg.muted' truncate maxW='14em' title={openFolder}>{folderName(openFolder)}</Text>
      )}
      <SaveStatus />
      <HStack gap={2} flexShrink={0} ml='auto'>
        <ColorModeToggle />
        <Button size='sm' colorPalette='brand' onClick={onRunSample} disabled={selectedRecipeId === undefined || running} loading={running}>
          Run sample
        </Button>
        <Button size='sm' variant='outline' onClick={onStop} disabled={!running}>
          Stop
        </Button>
        <Button size='sm' variant='ghost' onClick={onClear} disabled={running} title='Clear the records, trace and selection left from the last source'>
          Clear
        </Button>
      </HStack>
      <NewRecipeDialog folder={openFolder} open={newRecipeOpen} onClose={() => { setNewRecipeOpen(false) }} onCreated={onRecipeCreated} />
      <LoadUrlDialog open={urlOpen} onClose={() => { setUrlOpen(false) }} onLoad={onLoadUrl} />
      <OpenFolderDialog
        open={folderOpen}
        onClose={() => { setFolderOpen(false) }}
        folder={folder}
        onFolderChange={onFolderChange}
        onOpen={onOpen}
        onBrowse={onBrowse === undefined ? undefined : () => { void onBrowse() }}
        browsing={browsing}
      />
    </HStack>
  )
}
