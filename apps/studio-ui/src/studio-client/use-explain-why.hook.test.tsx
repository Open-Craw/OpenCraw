import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useExplainWhyMutation } from './use-explain-why.hook'

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

describe('useExplainWhyMutation', () => {
  it('sends explain-why and resolves to the sentence', async () => {
    const fetchMock = mockFetch({ sentence: '"price" is missing: no step in this recipe binds "value".', field: 'price', recipeId: 'books', outcome: 'missing' })
    const { result } = renderHook(() => useExplainWhyMutation(), { wrapper })

    act(() => { result.current.mutate({ kind: 'missing', recipeId: 'books', recordIndex: 0, field: 'price' }) })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.sentence).toContain('"price" is missing')
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'explain-why', target: { kind: 'missing', recipeId: 'books', recordIndex: 0, field: 'price' } }),
    }))
  })
})
