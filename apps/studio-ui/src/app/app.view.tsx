import { useEffect, useMemo, useState } from 'react'
import { Box, ChakraProvider, HStack, Splitter, Text, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { WhyTarget } from '@opencraw/studio'
import { ContentPane } from '../content-pane'
import { JsonEditor } from '../json-editor'
import { PreviewStrip } from '../preview'
import { RecordEditor } from '../record-editor'
import { StepsOutline } from '../steps-outline'
import {
  createStudioQueryClient,
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
import { useRunSessionStore, useStudioUiStore } from '../studio-store'
import { Toolbar } from './toolbar.component'

/** The studio's shell: the toolbar, the resizable content/editor split, and the preview strip along the bottom. */
export default function App () {
  const [queryClient] = useState(() => createStudioQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
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

  const folder = useStudioUiStore(state => state.folder)
  const openFolder = useStudioUiStore(state => state.openFolder)
  const selectedRecipeId = useStudioUiStore(state => state.selectedRecipeId)
  const editorTab = useStudioUiStore(state => state.editorTab)
  const setFolder = useStudioUiStore(state => state.setFolder)
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const selectRecipe = useStudioUiStore(state => state.selectRecipe)
  const setEditorTab = useStudioUiStore(state => state.setEditorTab)

  const workspace = useWorkspaceQuery(openFolder)
  const inputs = useInputRecipes()
  const selectedRecipe = useSelectedRecipe()

  const running = useRunSessionStore(state => state.running)
  const records = useRunSessionStore(state => state.records)
  const rejected = useRunSessionStore(state => state.rejected)
  const traceLines = useRunSessionStore(state => state.traceLines)
  const runError = useRunSessionStore(state => state.error)

  const runSample = useRunSampleMutation()
  const stopRun = useStopRunMutation()
  const saveRecipe = useSaveRecipeMutation()
  const saveOutline = useSaveOutlineMutation()
  const explainWhy = useExplainWhyMutation()

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

  const askWhy = (target: WhyTarget): void => { explainWhy.mutate(target) }

  const workspaceError = messageOf(workspace.error) ?? runError

  return (
    <Box h='100vh' display='flex' flexDirection='column'>
      <Toolbar
        folder={folder}
        onFolderChange={setFolder}
        onOpen={() => { commitFolder(folder) }}
        openFolder={openFolder}
        inputs={inputs}
        selectedRecipeId={selectedRecipeId}
        onSelectRecipe={selectRecipe}
        onRecipeCreated={selectRecipe}
        running={running}
        onRunSample={() => { if (selectedRecipeId !== undefined) runSample.mutate({ recipeId: selectedRecipeId }) }}
        onStop={() => { stopRun.mutate() }}
      />
      {workspaceError !== undefined && (
        <Box px={4} py={1} bg='red.subtle' color='red.fg' fontSize='sm'>{workspaceError}</Box>
      )}
      <Splitter.Root orientation='vertical' panels={[{ id: 'workspace', minSize: 20 }, { id: 'preview', minSize: 10 }]} defaultSize={[70, 30]} flex='1' minH='0'>
        <Splitter.Panel id='workspace' overflow='hidden'>
          <Splitter.Root panels={[{ id: 'content', minSize: 20 }, { id: 'editor', minSize: 20 }]} h='full'>
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
                <EditorTabButton label='Record' active={editorTab === 'record'} onClick={() => { setEditorTab('record') }} />
                <EditorTabButton label='JSON' active={editorTab === 'json'} onClick={() => { setEditorTab('json') }} />
              </HStack>
              <Box flex='1' minH='0' overflow='auto'>
                {editorTab === 'steps' && (
                  <StepsOutline
                    recipe={selectedRecipe}
                    onSaveOutline={async (path, outline) => { await saveOutline.mutateAsync({ path, outline }) }}
                  />
                )}
                {editorTab === 'record' && (
                  <RecordEditor
                    inputRecipe={selectedRecipe}
                    outputRecipe={outputRecipe}
                    records={records}
                    rejected={rejected}
                    onSaveInput={async (path, recipe) => { await saveRecipe.mutateAsync({ path, recipe }) }}
                    onSaveOutput={async (path, recipe) => { await saveRecipe.mutateAsync({ path, recipe }) }}
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
          <PreviewStrip
            records={records}
            traceLines={traceLines}
            rejected={rejected}
            onExplainMissing={selectedRecipeId === undefined ? undefined : (recordIndex, field) => { askWhy({ kind: 'missing', recipeId: selectedRecipeId, recordIndex, field }) }}
            onExplainRejected={selectedRecipeId === undefined ? undefined : (rejectedIndex) => { askWhy({ kind: 'rejected', recipeId: selectedRecipeId, rejectedIndex }) }}
            whyLoading={explainWhy.isPending}
            whyView={explainWhy.data}
            whyError={messageOf(explainWhy.error)}
          />
        </Splitter.Panel>
      </Splitter.Root>
    </Box>
  )
}

function messageOf (error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined

  return error instanceof Error ? error.message : String(error)
}

/** One of the editor pane's tab buttons (Steps, Record, JSON): a plain toggle, styled active/inactive rather than a full Chakra Tabs primitive, which the pane's own layout (a fixed strip above a scrolling body) does not need. */
function EditorTabButton ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
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
      colorPalette='blue'
      cursor='pointer'
      onClick={onClick}
    >
      {label}
    </Text>
  )
}
