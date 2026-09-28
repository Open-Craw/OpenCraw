import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useVerifySelectorMutation } from './use-verify-selector.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => { withUrl('?token=abc123') })

describe('useVerifySelectorMutation', () => {
  it('sends verify-selector and resolves to the match counts', async () => {
    const fetchMock = mockFetch({ selector: '.price', snapshotMatches: 3, liveChecked: true, liveMatches: 3 })
    const { result } = renderHook(() => useVerifySelectorMutation(), { wrapper })

    act(() => { result.current.mutate({ recipeId: 'books', path: 'start', selector: '.price' }) })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data).toEqual({ selector: '.price', snapshotMatches: 3, liveChecked: true, liveMatches: 3 })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'verify-selector', recipeId: 'books', path: 'start', selector: '.price' }),
    }))
  })
})
