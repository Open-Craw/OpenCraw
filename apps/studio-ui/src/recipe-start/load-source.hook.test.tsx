import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient, workspaceQueryKey } from '../studio-client'
import { resetStudioUiStore, useStudioUiStore } from '../studio-store'
import { useImportDocumentFlow } from './import-document.hook'
import { useLoadUrlFlow } from './load-url.hook'

interface SentCommand { type: string, [key: string]: unknown }

const webRecipe = { kind: 'input', id: 'books', output: 'books', mode: 'web', start: [{ url: 'https://old.test/' }], steps: [{ type: 'goto', url: '{{start.url}}' }], mapping: {} }
const documentRecipe = { kind: 'input', id: 'q3', output: 'q3', mode: 'api', start: [{ url: 'file:///r/q3.pdf' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }], mapping: {} }

function listing (recipe: { id: string }) {
  return { file: `/r/${recipe.id}.ocw-in.json`, kind: 'input', id: recipe.id, issues: [], text: JSON.stringify(recipe) }
}

function mockFetch (): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(init.body as string) as SentCommand
    const body = command.type === 'import-document'
      ? { path: `${command.folder as string}/${command.name as string}`, url: `file://${command.folder as string}/${command.name as string}` }
      : (command.type === 'open-workspace' ? { folder: command.folder, recipes: [] } : { saved: true })

    return { ok: true, status: 200, json: async () => body }
  })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function saved (fetchMock: jest.Mock): SentCommand[] {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as SentCommand)
    .filter(command => command.type === 'save-recipe')
}

/** A workspace on `/r` with `recipe` open and selected, already in the query cache as the shell has it. */
function openWith (recipe: { id: string }): QueryClient {
  const queryClient = createStudioQueryClient()
  queryClient.setQueryData(workspaceQueryKey('/r'), { folder: '/r', recipes: [listing(recipe)] })
  act(() => {
    useStudioUiStore.getState().commitFolder('/r')
    useStudioUiStore.getState().selectRecipe(recipe.id)
  })

  return queryClient
}

function wrapperFor (queryClient: QueryClient) {
  return function Wrapper ({ children }: PropsWithChildren): React.ReactElement {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  history.replaceState({}, '', '/?token=abc123')
  resetStudioUiStore()
})

describe('Load into the open recipe', () => {
  it('a page replaces only the start address of the open web recipe, and says what it replaced', async () => {
    const fetchMock = mockFetch()
    const { result } = renderHook(() => useLoadUrlFlow(), { wrapper: wrapperFor(openWith(webRecipe)) })

    await act(async () => { await result.current.loadUrl('https://new.test/catalog') })

    expect(saved(fetchMock)).toHaveLength(1)
    expect(saved(fetchMock)[0]).toMatchObject({ path: '/r/books.ocw-in.json', recipe: { id: 'books', steps: webRecipe.steps, start: [{ url: 'https://new.test/catalog' }] } })
    expect(result.current.notice).toBe('Loaded https://new.test/catalog into “books”, replacing https://old.test/.')
    expect(useStudioUiStore.getState().selectedRecipeId).toBe('books')
  })

  it('a page starts a new web recipe named after its host when the open recipe reads a document, leaving that one alone', async () => {
    const fetchMock = mockFetch()
    const { result } = renderHook(() => useLoadUrlFlow(), { wrapper: wrapperFor(openWith(documentRecipe)) })

    await act(async () => { await result.current.loadUrl('https://shop.test/catalog') })

    expect(saved(fetchMock).map(command => command.path)).toEqual(['/r/shop.ocw-out.json', '/r/shop.ocw-in.json'])
    expect(useStudioUiStore.getState().selectedRecipeId).toBe('shop')
    expect(result.current.notice).toMatch(/“q3” reads a document.*“q3” is unchanged/)
  })

  it('a document replaces the start address of the open document recipe', async () => {
    const fetchMock = mockFetch()
    const { result } = renderHook(() => useImportDocumentFlow(), { wrapper: wrapperFor(openWith(documentRecipe)) })

    await act(async () => { await result.current.importFile(new File(['%PDF-1.4'], 'q4.pdf')) })

    expect(saved(fetchMock)).toHaveLength(1)
    expect(saved(fetchMock)[0]).toMatchObject({ path: '/r/q3.ocw-in.json', recipe: { id: 'q3', start: [{ url: 'file:///r/q4.pdf' }] } })
    expect(result.current.notice).toBe('Loaded q4.pdf into “q3”, replacing file:///r/q3.pdf.')
  })

  it('a document starts a new recipe when the open recipe reads a web page', async () => {
    const fetchMock = mockFetch()
    const { result } = renderHook(() => useImportDocumentFlow(), { wrapper: wrapperFor(openWith(webRecipe)) })

    await act(async () => { await result.current.importFile(new File(['a,b'], 'rows.csv')) })

    expect(saved(fetchMock).map(command => command.path)).toEqual(['/r/rows.ocw-out.json', '/r/rows.ocw-in.json'])
    expect(useStudioUiStore.getState().selectedRecipeId).toBe('rows')
    expect(result.current.notice).toMatch(/“books” reads a web page.*“books” is unchanged/)
  })

  it('refuses a page with no folder to write into', async () => {
    const fetchMock = mockFetch()
    const { result } = renderHook(() => useLoadUrlFlow(), { wrapper: wrapperFor(createStudioQueryClient()) })

    await act(async () => { await result.current.loadUrl('https://shop.test/') })

    expect(result.current.error).toMatch(/Open a workspace folder first/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
