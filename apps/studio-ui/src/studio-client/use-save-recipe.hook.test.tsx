import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useSaveRecipeMutation } from './use-save-recipe.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

beforeEach(() => { withUrl('?token=abc123') })

describe('useSaveRecipeMutation', () => {
  it('sends save-recipe with the path and the recipe object, and invalidates the workspace query on success', async () => {
    const fetchMock = mockFetch({ saved: true })
    const queryClient = createStudioQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useSaveRecipeMutation(), { wrapper })
    act(() => { result.current.mutate({ path: '/r/book.output.json', recipe: { kind: 'output' } }) })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'save-recipe', path: '/r/book.output.json', recipe: { kind: 'output' } }),
    }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace'] })
  })
})
