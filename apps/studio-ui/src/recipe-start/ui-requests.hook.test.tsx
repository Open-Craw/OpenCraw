import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from '../studio-client'
import { resetStudioUiStore, resetUiRequestStore, useStudioUiStore, useUiRequestStore } from '../studio-store'
import { useUiRequests } from './ui-requests.hook'

let messageHandler: ((event: { data: string }) => void) | undefined

class FakeWebSocket {
  addEventListener (_type: string, handler: (event: { data: string }) => void): void {
    messageHandler = handler
  }

  close (): void {}
}

interface Sent { type: string, path?: string, requestId?: string, ok?: boolean, message?: string }

function mockFetch (answer: (command: Sent) => { ok: boolean, body: unknown }): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const { ok, body } = answer(JSON.parse(init.body as string) as Sent)

    return { ok, status: ok ? 200 : 500, json: async () => body }
  })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function sentTypes (fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map(([, init]) => (JSON.parse((init as RequestInit).body as string) as Sent).type)
}

function reports (fetchMock: jest.Mock): Sent[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as Sent).filter(command => command.type === 'ui-report')
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeAll(() => { Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, configurable: true }) })
beforeEach(() => {
  history.replaceState({}, '', '/?token=abc123')
  resetStudioUiStore()
  resetUiRequestStore()
  messageHandler = undefined
})

describe('useUiRequests', () => {
  it('opens the recipe a controller asked for, the way a link does', async () => {
    const fetchMock = mockFetch(command => ({ ok: true, body: command.type === 'open-path' ? { kind: 'recipe', folder: '/work', recipeId: 'books' } : (command.type === 'ui-report' ? { kept: true } : { folder: '/work', recipes: [] }) }))
    renderHook(() => useUiRequests(), { wrapper })

    act(() => { messageHandler?.({ data: JSON.stringify({ type: 'ui-request', requestId: 'r1', request: { kind: 'open', path: '/work/books.input.json' } }) }) })

    await waitFor(() => { expect(useStudioUiStore.getState().selectedRecipeId).toBe('books') })
    expect(useStudioUiStore.getState().openFolder).toBe('/work')
    await waitFor(() => { expect(sentTypes(fetchMock)).toContain('ui-report') })
    expect(reports(fetchMock)).toEqual([{ type: 'ui-report', requestId: 'r1', ok: true, message: 'Opened /work/books.input.json.' }])
  })

  it('shows the reason when the path cannot be opened, and ignores other events', async () => {
    const fetchMock = mockFetch(command => (command.type === 'ui-report' ? { ok: true, body: { kept: true } } : { ok: false, body: { error: 'no such file' } }))
    const { result } = renderHook(() => useUiRequests(), { wrapper })

    act(() => { messageHandler?.({ data: JSON.stringify({ type: 'workspace-changed' }) }) })
    expect(result.current).toBeUndefined()
    act(() => { messageHandler?.({ data: JSON.stringify({ type: 'ui-request', requestId: 'r2', request: { kind: 'open', path: '/nope' } }) }) })

    await waitFor(() => { expect(result.current).toBeDefined() })
    await waitFor(() => { expect(reports(fetchMock)).toHaveLength(1) })
    expect(reports(fetchMock)[0]).toMatchObject({ requestId: 'r2', ok: false })
  })

  it('selects the recipe a pick is for and leaves the pick to the content pane', () => {
    mockFetch(() => ({ ok: true, body: {} }))
    renderHook(() => useUiRequests(), { wrapper })

    act(() => { messageHandler?.({ data: JSON.stringify({ type: 'ui-request', requestId: 'r3', request: { kind: 'pick', recipeId: 'cars', text: 'Clio', add: true } }) }) })

    expect(useStudioUiStore.getState().selectedRecipeId).toBe('cars')
    expect(useUiRequestStore.getState().pick).toEqual({ requestId: 'r3', recipeId: 'cars', selector: undefined, text: 'Clio', add: true })
  })
})
