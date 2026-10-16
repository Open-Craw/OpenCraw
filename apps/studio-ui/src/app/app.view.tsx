import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, ChakraProvider, HStack, Splitter, Text } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { WhyTarget } from '@opencraw/studio'
import { DensityToggle, studioSystem, useApplyColorMode } from '../appearance'
import { ContentPane } from '../content-pane'
import { JsonEditor } from '../json-editor'
import { PreviewStrip } from '../preview'
import type { PreviewStripProps } from '../preview'
import { RecordEditor, fieldToStepIdOf } from '../record-editor'
import type { MappingRuleJson, RecordEditorProps } from '../record-editor'
import { HookNamesContext } from '../hook-names'
import { activeStubs, useHookStubsStore } from '../hook-stubs'
import { DocumentDropZone, useImportDocumentFlow, useLoadUrlFlow, useOpenPathFromLink } from '../recipe-start'
import { CARD_DRAG_MIME, PILL_DRAG_MIME, StepsOutline } from '../steps-outline'
import {
  createStudioQueryClient,
  plainError,
  useExplainWhyMutation,
  useInputRecipes,
  useRunSampleMutation,
  useSaveOutlineMutation,
  useSaveRecipeMutation,
  useSelectedRecipe,
  useStopRunMutation,
  useStudioClient,
  useStudioEvents,
  useWorkspaceQuery,
} from '../studio-client'
import { clearSourceState, useRunSessionStore, useStudioUiStore } from '../studio-store'
import { desktopBridge } from './desktop-bridge.client'
import { HooksBar } from './hooks-bar.component'
import { useBrowseFolderFlow } from './browse-folder.hook'
import { Toolbar } from './toolbar.component'

/** The studio's shell: the toolbar, the resizable content/editor split, and the preview strip along the bottom. */
export default function App () {
  const [queryClient] = useState(() => createStudioQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={studioSystem}>
        <AppShell />
      </ChakraProvider>
    </QueryClientProvider>
  )
}

/**
 * Everything that used to be `App`'s own `useState` pile: server data now
 * comes from TanStack Query (`useWorkspaceQuery`, `useSelectedRecipe`,
 * `useStartPageQuery`), client-only UI state from `studio-store`'s Zustand
 * stores (`studio-ui.store.ts` for the folder/recipe/tab, `run-session.store.ts`
 * for the live run), and saves go through mutations that invalidate the
 * workspace query instead of the old manual `open(folder)` reload.
 */
function AppShell () {
  const client = useStudioClient()
  useStudioEvents()
  useApplyColorMode()

  const folder = useStudioUiStore(state => state.folder)
  const openFolder = useStudioUiStore(state => state.openFolder)
  const selectedRecipeId = useStudioUiStore(state => state.selectedRecipeId)
  const editorTab = useStudioUiStore(state => state.editorTab)
  const setFolder = useStudioUiStore(state => state.setFolder)
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const selectRecipe = useStudioUiStore(state => state.selectRecipe)
  const setEditorTab = useStudioUiStore(state => state.setEditorTab)
  const hoveredStepId = useStudioUiStore(state => state.hoveredStepId)
  const setHoveredStepId = useStudioUiStore(state => state.setHoveredStepId)

  // The splitters' sizes are kept here: left alone, a splitter goes back to its default sizes whenever its box is resized, so dragging the divider of one would reset the other.
  const [rowSizes, setRowSizes] = useState([70, 30])
  const [columnSizes, setColumnSizes] = useState([50, 50])

  const workspace = useWorkspaceQuery(openFolder)
  const inputs = useInputRecipes()
  const selectedRecipe = useSelectedRecipe()

  const running = useRunSessionStore(state => state.running)
  const runError = useRunSessionStore(state => state.error)

  const runSample = useRunSampleMutation()
  const stubEntries = useHookStubsStore(state => state.entries)
  const stopRun = useStopRunMutation()
  const saveRecipe = useSaveRecipeMutation()
  const saveOutline = useSaveOutlineMutation()
  const explainWhy = useExplainWhyMutation()
  const importFlow = useImportDocumentFlow()
  const urlFlow = useLoadUrlFlow()
  const browseFlow = useBrowseFolderFlow()
  const linkError = useOpenPathFromLink()

  useEffect(() => {
    if (client.initialFolder !== undefined) commitFolder(client.initialFolder)
    // Only on mount: the folder box is a plain input the person edits and confirms with Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedRecipeId !== undefined || workspace.data === undefined) return
    const input = workspace.data.recipes.find(recipe => recipe.kind === 'input')
    if (input?.id !== undefined) selectRecipe(input.id)
  }, [workspace.data, selectedRecipeId, selectRecipe])

  /** The selected input recipe's own output recipe (its `output` id), found in the same workspace listing — `undefined` when the input does not parse or names no output found here (the Record tab then says so, same as the JSON tab shows a recipe's own issues). */
  const outputRecipe = useMemo(() => {
    if (selectedRecipe === undefined || selectedRecipe.kind !== 'input') return
    try {
      const outputId = (JSON.parse(selectedRecipe.text) as { output?: unknown }).output

      return workspace.data?.recipes.find(recipe => recipe.kind === 'output' && recipe.id === outputId)
    } catch {
      return
    }
  }, [selectedRecipe, workspace.data])

  /** The selected input recipe's mapping, reduced to its cross-panel highlight id space (issue #111): output field name → source step id, for every field whose rule reads from a single plain step id. `{}` (not thrown) for text that doesn't parse yet — same "leave it to the JSON tab's own error" treatment as `outputRecipe` above. */
  const fieldToStepId = useMemo(() => {
    if (selectedRecipe === undefined || selectedRecipe.kind !== 'input') return {}
    try {
      const mapping = (JSON.parse(selectedRecipe.text) as { mapping?: Record<string, MappingRuleJson> }).mapping

      return mapping === undefined ? {} : fieldToStepIdOf(mapping)
    } catch {
      return {}
    }
  }, [selectedRecipe])
  const highlightedField = Object.keys(fieldToStepId).find(field => fieldToStepId[field] === hoveredStepId && hoveredStepId !== undefined)

  const bridge = useMemo(() => desktopBridge(), [])
  const chooseFolder = bridge === undefined ? undefined : () => { void bridge.chooseFolder() }

  const askWhy = (target: WhyTarget): void => { explainWhy.mutate(target) }

  const workspaceError = linkError ?? importFlow.error ?? urlFlow.error ?? browseFlow.error ?? messageOf(workspace.error) ?? (runError === undefined ? undefined : plainError(runError))

  const loadNotice = importFlow.notice ?? urlFlow.notice

  return (
    <HookNamesContext.Provider value={workspace.data?.hooks?.names}>
      <DocumentDropZone onFile={file => { void importFlow.importFile(file) }} h='100vh' display='flex' flexDirection='column'>
        <Toolbar
          folder={folder}
          onFolderChange={setFolder}
          onOpen={() => { commitFolder(folder) }}
          onChooseFolder={chooseFolder}
          onBrowse={browseFlow.browse}
          browsing={browseFlow.pending}
          openFolder={openFolder}
          inputs={inputs}
          selectedRecipeId={selectedRecipeId}
          onSelectRecipe={selectRecipe}
          onRecipeCreated={selectRecipe}
          onImportFile={file => { void importFlow.importFile(file) }}
          onLoadUrl={url => { void urlFlow.loadUrl(url) }}
          importing={importFlow.pending || urlFlow.pending}
          running={running}
          onRunSample={() => { if (selectedRecipeId !== undefined) runSample.mutate({ recipeId: selectedRecipeId, stubs: activeStubs(stubEntries) }) }}
          onStop={() => { stopRun.mutate() }}
          onClear={() => { clearSourceState(); explainWhy.reset() }}
        />
        <HooksBar hooks={workspace.data?.hooks} />
        {loadNotice !== undefined && workspaceError === undefined && (
          <Box role='status' px={4} py={1} bg='brand.subtle' color='brand.fg' fontSize='sm'>{loadNotice}</Box>
        )}
        {workspaceError !== undefined && (
          <Box px={4} py={1} bg='red.subtle' color='red.fg' fontSize='sm'>{workspaceError}</Box>
        )}
        <Splitter.Root orientation='vertical' panels={[{ id: 'workspace', minSize: 20 }, { id: 'preview', minSize: 10 }]} size={rowSizes} onResize={(details) => { setRowSizes(details.size) }} flex='1' minH='0'>
          <Splitter.Panel id='workspace' overflow='hidden'>
            <Splitter.Root panels={[{ id: 'content', minSize: 20 }, { id: 'editor', minSize: 20 }]} size={columnSizes} onResize={(details) => { setColumnSizes(details.size) }} h='full'>
              <Splitter.Panel id='content' overflow='auto'>
                <ContentPane
                  recipe={selectedRecipe}
                  onSaveOutline={async (path, outline) => { await saveOutline.mutateAsync({ path, outline }) }}
                  onSaveRecipe={async (path, recipe) => { await saveRecipe.mutateAsync({ path, recipe }) }}
                />
              </Splitter.Panel>
              <Splitter.ResizeTrigger id='content:editor' />
              <Splitter.Panel id='editor' overflow='hidden' display='flex' flexDirection='column'>
                <HStack gap={1} px={2} pt={2} borderBottomWidth='1px' flexShrink={0}>
                  <EditorTabButton label='Steps' active={editorTab === 'steps'} onClick={() => { setEditorTab('steps') }} />
                  <EditorTabButton label='Record' active={editorTab === 'record'} onClick={() => { setEditorTab('record') }} switchOnDrag />
                  <EditorTabButton label='JSON' active={editorTab === 'json'} onClick={() => { setEditorTab('json') }} />
                  {editorTab === 'steps' && <Box ml='auto' pb={1}><DensityToggle /></Box>}
                </HStack>
                <Box flex='1' minH='0' overflow='auto'>
                  {editorTab === 'steps' && (
                    <StepsOutline
                      recipe={selectedRecipe}
                      onSaveOutline={async (path, outline) => { await saveOutline.mutateAsync({ path, outline }) }}
                    />
                  )}
                  {editorTab === 'record' && (
                    <ConnectedRecordEditor
                      inputRecipe={selectedRecipe}
                      outputRecipe={outputRecipe}
                      onSaveInput={async (path, recipe) => { await saveRecipe.mutateAsync({ path, recipe }) }}
                      onSaveOutput={async (path, recipe) => { await saveRecipe.mutateAsync({ path, recipe }) }}
                      onSaveOutline={async (path, outline) => { await saveOutline.mutateAsync({ path, outline }) }}
                      onExplainMissing={selectedRecipeId === undefined ? undefined : (recordIndex, field) => { askWhy({ kind: 'missing', recipeId: selectedRecipeId, recordIndex, field }) }}
                      onExplainRejected={selectedRecipeId === undefined ? undefined : (rejectedIndex) => { askWhy({ kind: 'rejected', recipeId: selectedRecipeId, rejectedIndex }) }}
                    />
                  )}
                  {editorTab === 'json' && (
                    <JsonEditor
                      recipe={selectedRecipe}
                      onSave={async (path, recipe) => { await saveRecipe.mutateAsync({ path, recipe }) }}
                    />
                  )}
                </Box>
              </Splitter.Panel>
            </Splitter.Root>
          </Splitter.Panel>
          <Splitter.ResizeTrigger id='workspace:preview' />
          <Splitter.Panel id='preview' overflow='hidden' borderTopWidth='1px'>
            <ConnectedPreviewStrip
              onExplainMissing={selectedRecipeId === undefined ? undefined : (recordIndex, field) => { askWhy({ kind: 'missing', recipeId: selectedRecipeId, recordIndex, field }) }}
              onExplainRejected={selectedRecipeId === undefined ? undefined : (rejectedIndex) => { askWhy({ kind: 'rejected', recipeId: selectedRecipeId, rejectedIndex }) }}
              whyLoading={explainWhy.isPending}
              whyView={explainWhy.data}
              whyError={messageOf(explainWhy.error)}
              highlightedField={highlightedField}
              onHoverField={field => { setHoveredStepId(field === undefined ? undefined : fieldToStepId[field]) }}
            />
          </Splitter.Panel>
        </Splitter.Root>
      </DocumentDropZone>
    </HookNamesContext.Provider>
  )
}

/**
 * The Record tab, given the run's records and rejections by the store itself and not by the shell: a run streams results many times a second, and
 * every one of them redrew the whole window (the steps, the editors, the page) when the shell held them. Only this panel redraws now.
 */
function ConnectedRecordEditor (props: Omit<RecordEditorProps, 'records' | 'rejected'>) {
  const records = useRunSessionStore(state => state.records)
  const rejected = useRunSessionStore(state => state.rejected)

  return <RecordEditor {...props} records={records} rejected={rejected} />
}

/** The records / trace strip, given the run's output by the store itself, for the same reason as {@link ConnectedRecordEditor}. */
function ConnectedPreviewStrip (props: Omit<PreviewStripProps, 'records' | 'traceLines' | 'rejected'>) {
  const records = useRunSessionStore(state => state.records)
  const rejected = useRunSessionStore(state => state.rejected)
  const traceLines = useRunSessionStore(state => state.traceLines)

  return <PreviewStrip {...props} records={records} traceLines={traceLines} rejected={rejected} />
}

function messageOf (error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined

  return plainError(error instanceof Error ? error.message : String(error))
}

/** Whether a drag in flight carries a pill or a content-pane selection. */
function carriesValue (event: React.DragEvent): boolean {
  const types = new Set(event.dataTransfer.types)

  return types.has(PILL_DRAG_MIME) || types.has(CARD_DRAG_MIME)
}

/** How long a pill or a selection is held over a tab before it opens: long enough to pass over by accident, short enough not to feel stuck. */
const DRAG_SWITCH_MS = 450

/**
 * One of the editor pane's tab buttons (Steps, Record, JSON): a plain toggle, styled active/inactive rather than a full Chakra Tabs primitive, which the pane's own layout (a fixed strip above a scrolling body) does not need.
 *
 * With `switchOnDrag`, holding a pill or a content-pane selection over it opens the tab, so a value can be dragged from the Steps tab (or the content pane) and dropped on the Record tab's output list, which the tab strip would otherwise hide.
 */
function EditorTabButton ({ label, active, onClick, switchOnDrag = false }: { label: string, active: boolean, onClick: () => void, switchOnDrag?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clear = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
  }
  const dragOver = (event: React.DragEvent): void => {
    if (!switchOnDrag || active || !carriesValue(event)) return
    event.preventDefault()
    timer.current ??= setTimeout(() => {
      timer.current = undefined
      onClick()
    }, DRAG_SWITCH_MS)
  }

  return (
    <Text
      as='button'
      px={3}
      py={1}
      fontSize='sm'
      fontWeight={active ? 'semibold' : 'normal'}
      color={active ? 'fg' : 'fg.muted'}
      borderBottomWidth='2px'
      borderColor={active ? 'colorPalette.solid' : 'transparent'}
      colorPalette='brand'
      cursor='pointer'
      onClick={onClick}
      onDragEnter={dragOver}
      onDragOver={dragOver}
      onDragLeave={clear}
      onDrop={clear}
    >
      {label}
    </Text>
  )
}
