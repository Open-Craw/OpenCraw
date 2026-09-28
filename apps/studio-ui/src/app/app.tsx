import { useEffect, useState } from 'react'
import { Box, ChakraProvider, HStack, Splitter, Text, defaultSystem } from '@chakra-ui/react'
import type { OutlineView, WorkspaceView } from '@opencraw/studio'
import { ContentPane } from '../content-pane'
import { JsonEditor } from '../json-editor'
import type { PreviewRecord } from '../preview'
import { PreviewStrip } from '../preview'
import { StepsOutline } from '../steps-outline'
import { useStudioClient } from '../studio-client'
import { Toolbar } from './toolbar'

type EditorTab = 'steps' | 'json'

/** The studio's shell: the toolbar, the resizable content/editor split, and the preview strip along the bottom. */
export default function App () {
  const client = useStudioClient()
  const [folder, setFolder] = useState(client.initialFolder ?? '')
  const [workspace, setWorkspace] = useState<WorkspaceView>()
  const [workspaceError, setWorkspaceError] = useState<string>()
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>()
  const [html, setHtml] = useState<string>()
  const [records, setRecords] = useState<PreviewRecord[]>([])
  const [traceLines, setTraceLines] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [editorTab, setEditorTab] = useState<EditorTab>('steps')

  useEffect(() => (
    client.subscribe((event) => {
      switch (event.type) {
        case 'trace-line': {
          setTraceLines(lines => [...lines, event.line])
          break
        }
        case 'record': {
          setRecords(current => [...current, { key: event.key, data: event.data }])
          break
        }
        case 'run-finished': { {
          setRunning(false)
          // No default
        }
        break
        }
      }
    })
  ), [client])

  const open = async (folderToOpen: string): Promise<void> => {
    try {
      const view = await client.openWorkspace(folderToOpen)
      setWorkspace(view)
      setWorkspaceError(undefined)
      const input = view.recipes.find(recipe => recipe.kind === 'input')
      setSelectedRecipeId(current => current ?? input?.id)
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    if (client.initialFolder !== undefined) void open(client.initialFolder)
    // Only on mount: the folder box is a plain input the person edits and confirms with Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setHtml(undefined)
    if (selectedRecipeId === undefined) return
    const recipeId = selectedRecipeId
    const fetchPage = async (): Promise<void> => {
      try {
        setHtml(await client.fetchStartPage(recipeId))
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : String(error))
      }
    }
    void fetchPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipeId])

  const runSample = async (): Promise<void> => {
    if (selectedRecipeId === undefined) return
    setRecords([])
    setTraceLines([])
    setRunning(true)
    try {
      await client.runSample(selectedRecipeId)
    } catch (error) {
      setRunning(false)
      setWorkspaceError(error instanceof Error ? error.message : String(error))
    }
  }

  const stop = async (): Promise<void> => {
    await client.stopRun()
  }

  const saveRecipe = async (path: string, recipe: unknown): Promise<void> => {
    await client.saveRecipe(path, recipe)
    await open(folder)
  }

  const saveOutline = async (path: string, outline: OutlineView): Promise<void> => {
    await client.saveOutline(path, outline)
    await open(folder)
  }

  const inputs = workspace?.recipes.filter(recipe => recipe.kind === 'input') ?? []
  const selectedRecipe = workspace?.recipes.find(recipe => recipe.id === selectedRecipeId)

  return (
    <ChakraProvider value={defaultSystem}>
      <Box h='100vh' display='flex' flexDirection='column'>
        <Toolbar
          folder={folder}
          onFolderChange={setFolder}
          onOpen={() => { void open(folder) }}
          inputs={inputs}
          selectedRecipeId={selectedRecipeId}
          onSelectRecipe={setSelectedRecipeId}
          running={running}
          onRunSample={() => { void runSample() }}
          onStop={() => { void stop() }}
        />
        {workspaceError !== undefined && (
          <Box px={4} py={1} bg='red.subtle' color='red.fg' fontSize='sm'>{workspaceError}</Box>
        )}
        <Box flex='1' minH='0'>
          <Splitter.Root panels={[{ id: 'content', minSize: 20 }, { id: 'editor', minSize: 20 }]} h='full'>
            <Splitter.Panel id='content' overflow='auto'>
              <ContentPane html={html} />
            </Splitter.Panel>
            <Splitter.ResizeTrigger id='content:editor' />
            <Splitter.Panel id='editor' overflow='hidden' display='flex' flexDirection='column'>
              <HStack gap={1} px={2} pt={2} borderBottomWidth='1px' flexShrink={0}>
                <EditorTabButton label='Steps' active={editorTab === 'steps'} onClick={() => { setEditorTab('steps') }} />
                <EditorTabButton label='JSON' active={editorTab === 'json'} onClick={() => { setEditorTab('json') }} />
              </HStack>
              <Box flex='1' minH='0' overflow='auto'>
                {editorTab === 'steps' && <StepsOutline recipe={selectedRecipe} onSaveOutline={saveOutline} />}
                {editorTab === 'json' && <JsonEditor recipe={selectedRecipe} onSave={saveRecipe} />}
              </Box>
            </Splitter.Panel>
          </Splitter.Root>
        </Box>
        <Box h='260px' borderTopWidth='1px' flexShrink={0}>
          <PreviewStrip records={records} traceLines={traceLines} />
        </Box>
      </Box>
    </ChakraProvider>
  )
}

/** One of the editor pane's tab buttons (Steps, JSON): a plain toggle, styled active/inactive rather than a full Chakra Tabs primitive, which the pane's own layout (a fixed strip above a scrolling body) does not need. */
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
