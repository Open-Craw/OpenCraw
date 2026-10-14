import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from '../studio-client'
import { resetStudioUiStore, useStudioUiStore } from '../studio-store'
import { useOpenPathFromLink } from './open-path.hook'

interface SentCommand { type: string, [key: string]: unknown }

/** Answers `open-path` with the given view, `open-workspace` with an empty listing, anything else with `{ saved: true }`. */
function mockFetch (view: unknown): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(init.body as string) as SentCommand
    const body = command.type === 'open-path'
      ? view
      : (command.type === 'open-workspace' ? { folder: command.folder, recipes: [] } : { saved: true })

    return { ok: true, status: 200, json: async () => body }
  })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function sentCommands (fetchMock: jest.Mock): SentCommand[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as SentCommand)
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  history.replaceState({}, '', '/?token=abc123&folder=%2Fwork&open=%2Fwork%2Fdocs%2Freport.pdf')
  resetStudioUiStore()
})

describe('useOpenPathFromLink (issue #235)', () => {
  it('asks the server about the path, with the workspace of the link', async () => {
    const fetchMock = mockFetch({ kind: 'folder', folder: '/work/docs' })
    renderHook(() => useOpenPathFromLink(), { wrapper })

    await waitFor(() => { expect(useStudioUiStore.getState().openFolder).toBe('/work/docs') })

    expect(sentCommands(fetchMock)[0]).toEqual({ type: 'open-path', path: '/work/docs/report.pdf', workspace: '/work' })
  })

  it('selects the recipe a recipe file names', async () => {
    mockFetch({ kind: 'recipe', folder: '/work', recipeId: 'books' })
    renderHook(() => useOpenPathFromLink(), { wrapper })

    await waitFor(() => { expect(useStudioUiStore.getState().selectedRecipeId).toBe('books') })

    expect(useStudioUiStore.getState().openFolder).toBe('/work')
  })

  it('starts a recipe from a document, reading it where the server put it', async () => {
    const fetchMock = mockFetch({ kind: 'document', folder: '/work', path: '/work/docs/Q3 Report.pdf', url: 'file:///work/docs/Q3%20Report.pdf' })
    renderHook(() => useOpenPathFromLink(), { wrapper })

    await waitFor(() => { expect(useStudioUiStore.getState().selectedRecipeId).toBe('q3-report') })

    const saves = sentCommands(fetchMock).filter(command => command.type === 'save-recipe')
    expect(saves).toHaveLength(2)
    expect(saves[1]).toMatchObject({ recipe: { kind: 'input', id: 'q3-report', start: [{ url: 'file:///work/docs/Q3%20Report.pdf' }] } })
  })

  it('forgets the path in the address, so a reload does not start a second recipe', async () => {
    mockFetch({ kind: 'folder', folder: '/work' })
    renderHook(() => useOpenPathFromLink(), { wrapper })

    await waitFor(() => { expect(location.search).not.toContain('open=') })

    expect(location.search).toContain('token=abc123')
  })

  it('does nothing when the link names no path', () => {
    history.replaceState({}, '', '/?token=abc123')
    const fetchMock = mockFetch({})
    const { result } = renderHook(() => useOpenPathFromLink(), { wrapper })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toBeUndefined()
  })
})
