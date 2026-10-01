import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from '../studio-client'
import { resetStudioUiStore, useStudioUiStore } from '../studio-store'
import { useImportDocumentFlow } from './import-document.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

interface SentCommand { type: string, [key: string]: unknown }

/** Answers each command by its type: `import-document` with the copy's url, `open-workspace` with the given listing, anything else with `{ saved: true }`. */
function mockFetch (listing: { id?: string }[]): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(init.body as string) as SentCommand
    const body = command.type === 'import-document'
      ? { path: `${command.folder as string}/${command.name as string}`, url: `file://${command.folder as string}/${command.name as string}` }
      : (command.type === 'open-workspace' ? { folder: command.folder, recipes: listing } : { saved: true })

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
  withUrl('?token=abc123')
  resetStudioUiStore()
})

describe('useImportDocumentFlow (issue #120)', () => {
  it('copies the file into the open folder, saves an api recipe pair reading it, and selects the new recipe', async () => {
    const fetchMock = mockFetch([])
    act(() => { useStudioUiStore.getState().commitFolder('/r') })
    const { result } = renderHook(() => useImportDocumentFlow(), { wrapper })

    await act(async () => { await result.current.importFile(new File(['%PDF-1.4'], 'Q3 Report.pdf', { type: 'application/pdf' })) })

    const commands = sentCommands(fetchMock)
    expect(commands.map(command => command.type)).toEqual(['import-document', 'open-workspace', 'save-recipe', 'save-recipe'])
    expect(commands[0]).toEqual({ type: 'import-document', folder: '/r', name: 'Q3 Report.pdf', bytes: btoa('%PDF-1.4') })
    expect(commands[2]).toMatchObject({ path: '/r/q3-report.output.json', recipe: { kind: 'output', id: 'q3-report' } })
    expect(commands[3]).toMatchObject({ path: '/r/q3-report.input.json', recipe: { kind: 'input', id: 'q3-report', mode: 'api', start: [{ url: 'file:///r/Q3 Report.pdf' }] } })
    expect(useStudioUiStore.getState().selectedRecipeId).toBe('q3-report')
    expect(result.current.error).toBeUndefined()
  })

  it('starts a workspace from the folder box when none is open yet, opening it once the recipe is saved', async () => {
    mockFetch([])
    act(() => { useStudioUiStore.getState().setFolder('/new/workspace') })
    const { result } = renderHook(() => useImportDocumentFlow(), { wrapper })

    await act(async () => { await result.current.importFile(new File(['a,b'], 'rows.csv')) })

    expect(useStudioUiStore.getState().openFolder).toBe('/new/workspace')
    expect(useStudioUiStore.getState().selectedRecipeId).toBe('rows')
  })

  it('numbers the recipe id past one already in the folder, never overwriting its files', async () => {
    const fetchMock = mockFetch([{ id: 'rows' }, { id: 'rows-2' }])
    act(() => { useStudioUiStore.getState().commitFolder('/r') })
    const { result } = renderHook(() => useImportDocumentFlow(), { wrapper })

    await act(async () => { await result.current.importFile(new File(['a,b'], 'rows.csv')) })

    expect(sentCommands(fetchMock)[2]).toMatchObject({ path: '/r/rows-3.output.json' })
    expect(useStudioUiStore.getState().selectedRecipeId).toBe('rows-3')
  })

  it('refuses a drop with no folder to put it in, with a message and no request sent', async () => {
    const fetchMock = mockFetch([])
    const { result } = renderHook(() => useImportDocumentFlow(), { wrapper })

    await act(async () => { await result.current.importFile(new File(['a,b'], 'rows.csv')) })

    await waitFor(() => { expect(result.current.error).toMatch(/workspace folder/) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a server error and leaves the workspace untouched', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'disk full' }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })
    act(() => { useStudioUiStore.getState().commitFolder('/r') })
    const { result } = renderHook(() => useImportDocumentFlow(), { wrapper })

    await act(async () => { await result.current.importFile(new File(['a,b'], 'rows.csv')) })

    await waitFor(() => { expect(result.current.error).toBe('disk full') })
    expect(useStudioUiStore.getState().selectedRecipeId).toBeUndefined()
  })
})
