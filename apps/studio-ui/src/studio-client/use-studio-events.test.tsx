import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { resetRunSessionStore, useRunSessionStore } from '../studio-store'
import { createStudioQueryClient } from './query-client'
import { useStudioEvents } from './use-studio-events'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

let messageHandler: ((event: { data: string }) => void) | undefined

class FakeWebSocket {
  addEventListener (_type: string, handler: (event: { data: string }) => void): void {
    messageHandler = handler
  }

  close (): void {}
}

function send (event: unknown): void {
  act(() => { messageHandler?.({ data: JSON.stringify(event) }) })
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, configurable: true })
})

beforeEach(() => {
  withUrl('?token=abc123')
  resetRunSessionStore()
  messageHandler = undefined
})

describe('useStudioEvents', () => {
  it('appends trace-line events to the run session store', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'trace-line', line: '▶ books' })
    expect(useRunSessionStore.getState().traceLines).toEqual(['▶ books'])
  })

  it('appends record events to the run session store', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'record', recipeId: 'books', key: 'a1', data: { name: 'Widget' } })
    expect(useRunSessionStore.getState().records).toEqual([{ key: 'a1', data: { name: 'Widget' } }])
  })

  it('stops the run on run-finished', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    act(() => { useRunSessionStore.getState().startRun() })
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'run-finished', recipeId: 'books', emitted: 1, rejected: 0, duplicates: 0, durationMs: 5 })
    expect(useRunSessionStore.getState().running).toBe(false)
  })

  it('invalidates the workspace query on workspace-changed', async () => {
    const queryClient = createStudioQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'workspace-changed' })
    await waitFor(() => { expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace'] }) })
  })
})
