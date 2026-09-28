import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { resetRecordingStore, useRecordingStore } from '../studio-store'
import { createStudioQueryClient } from './query-client'
import { useStartRecordingMutation } from './use-start-recording.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  withUrl('?token=abc123')
  resetRecordingStore()
})

describe('useStartRecordingMutation', () => {
  it('marks the recording active for the recipe/url before the server confirms', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ started: true }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

    const { result } = renderHook(() => useStartRecordingMutation(), { wrapper })
    act(() => { result.current.mutate({ recipeId: 'login', startUrl: 'https://example.test/login' }) })

    expect(useRecordingStore.getState().active).toBe(true)
    expect(useRecordingStore.getState().recipeId).toBe('login')
    expect(useRecordingStore.getState().startUrl).toBe('https://example.test/login')
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'start-recording', recipeId: 'login' }),
    }))
  })

  it('stops showing it as active and records the error when the server refuses to start', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'open a workspace first' }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

    const { result } = renderHook(() => useStartRecordingMutation(), { wrapper })
    act(() => { result.current.mutate({ recipeId: 'login', startUrl: 'https://example.test/login' }) })

    await waitFor(() => { expect(result.current.isError).toBe(true) })
    expect(useRecordingStore.getState().active).toBe(false)
    expect(useRecordingStore.getState().error).toBe('open a workspace first')
  })
})
