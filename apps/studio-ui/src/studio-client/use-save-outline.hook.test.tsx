import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import type { OutlineView } from '@opencraw/studio'
import { createStudioQueryClient } from './query-client'
import { useSaveOutlineMutation } from './use-save-outline.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

beforeEach(() => { withUrl('?token=abc123') })

describe('useSaveOutlineMutation', () => {
  it('sends save-outline with the path and the outline, and invalidates the workspace query on success', async () => {
    const outline: OutlineView = { recipe: { kind: 'input', id: 'books' }, steps: [] }
    const fetchMock = mockFetch({ saved: true })
    const queryClient = createStudioQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useSaveOutlineMutation(), { wrapper })
    act(() => { result.current.mutate({ path: '/r/books.input.json', outline }) })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'save-outline', path: '/r/books.input.json', outline }),
    }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace'] })
  })
})
