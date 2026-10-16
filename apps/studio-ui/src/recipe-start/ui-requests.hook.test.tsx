import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from '../studio-client'
import { resetStudioUiStore, useStudioUiStore } from '../studio-store'
import { useUiRequests } from './ui-requests.hook'

let messageHandler: ((event: { data: string }) => void) | undefined

class FakeWebSocket {
  addEventListener (_type: string, handler: (event: { data: string }) => void): void {
    messageHandler = handler
  }

  close (): void {}
}

function mockFetch (answer: (command: { type: string, path?: string }) => { ok: boolean, body: unknown }): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const { ok, body } = answer(JSON.parse(init.body as string) as { type: string, path?: string })

    return { ok, status: ok ? 200 : 500, json: async () => body }
  })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeAll(() => { Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, configurable: true }) })
beforeEach(() => {
  history.replaceState({}, '', '/?token=abc123')
  resetStudioUiStore()
  messageHandler = undefined
})

describe('useUiRequests', () => {
  it('opens the recipe a controller asked for, the way a link does', async () => {
    mockFetch(command => ({ ok: true, body: command.type === 'open-path' ? { kind: 'recipe', folder: '/work', recipeId: 'books' } : { folder: '/work', recipes: [] } }))
    renderHook(() => useUiRequests(), { wrapper })

    act(() => { messageHandler?.({ data: JSON.stringify({ type: 'ui-request', request: { kind: 'open', path: '/work/books.input.json' } }) }) })

    await waitFor(() => { expect(useStudioUiStore.getState().selectedRecipeId).toBe('books') })
    expect(useStudioUiStore.getState().openFolder).toBe('/work')
  })

  it('shows the reason when the path cannot be opened, and ignores other events', async () => {
    mockFetch(() => ({ ok: false, body: { error: 'no such file' } }))
    const { result } = renderHook(() => useUiRequests(), { wrapper })

    act(() => { messageHandler?.({ data: JSON.stringify({ type: 'workspace-changed' }) }) })
    expect(result.current).toBeUndefined()
    act(() => { messageHandler?.({ data: JSON.stringify({ type: 'ui-request', request: { kind: 'open', path: '/nope' } }) }) })

    await waitFor(() => { expect(result.current).toBeDefined() })
  })
})
