import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useInferSelectorMutation } from './use-infer-selector'

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

describe('useInferSelectorMutation', () => {
  it('sends infer-selector with two node ids and resolves to the list shape', async () => {
    const body = { kind: 'list', item: { selector: 'article.product_pod', tier: 'class', matches: 20 }, field: { selector: 'p.price_color', tier: 'class', take: 'text', matches: 20 } }
    const fetchMock = mockFetch(body)
    const { result } = renderHook(() => useInferSelectorMutation(), { wrapper })

    act(() => { result.current.mutate({ recipeId: 'books', path: 'start', nodeIds: ['n5', 'n12'] }) })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data).toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: ['n5', 'n12'] }),
    }))
  })
})
