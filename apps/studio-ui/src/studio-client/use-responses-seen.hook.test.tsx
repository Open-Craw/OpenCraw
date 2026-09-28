import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useResponsesSeenMutation } from './use-responses-seen.hook'

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

describe('useResponsesSeenMutation', () => {
  it('sends responses-seen and resolves to the observed responses', async () => {
    const body = { responses: [{ url: 'http://x/api/products', status: 200, size: 512, shape: 'array (3) of object' }] }
    const fetchMock = mockFetch(body)
    const { result } = renderHook(() => useResponsesSeenMutation(), { wrapper })

    act(() => { result.current.mutate({ recipeId: 'books', path: 'start' }) })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data).toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'responses-seen', recipeId: 'books', path: 'start' }),
    }))
  })
})
