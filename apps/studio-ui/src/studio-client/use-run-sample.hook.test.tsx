import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { resetRunSessionStore, useRunSessionStore } from '../studio-store'
import { createStudioQueryClient } from './query-client'
import { useRunSampleMutation } from './use-run-sample.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  withUrl('?token=abc123')
  resetRunSessionStore()
})

describe('useRunSampleMutation', () => {
  it('marks the run session running (and clears prior output) before the server confirms', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ started: true }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })
    act(() => { useRunSessionStore.getState().appendTraceLine('stale') })

    const { result } = renderHook(() => useRunSampleMutation(), { wrapper })
    act(() => { result.current.mutate({ recipeId: 'books' }) })

    expect(useRunSessionStore.getState().running).toBe(true)
    expect(useRunSessionStore.getState().traceLines).toEqual([])
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'run-sample', recipeId: 'books' }),
    }))
    // Still running: only `run-finished` (use-studio-events.ts) or onError clears it.
    expect(useRunSessionStore.getState().running).toBe(true)
  })

  it('stops the run and records the error when the server rejects the request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'no workspace open' }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

    const { result } = renderHook(() => useRunSampleMutation(), { wrapper })
    act(() => { result.current.mutate({ recipeId: 'books' }) })

    await waitFor(() => { expect(result.current.isError).toBe(true) })
    expect(useRunSessionStore.getState().running).toBe(false)
    expect(useRunSessionStore.getState().error).toBe('no workspace open')
  })
})
