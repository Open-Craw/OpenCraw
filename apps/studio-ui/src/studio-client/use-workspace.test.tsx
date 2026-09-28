import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useWorkspaceQuery } from './use-workspace'

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

describe('useWorkspaceQuery', () => {
  it('is disabled when no folder is given', () => {
    const fetchMock = mockFetch({ folder: 'recipes', recipes: [] })
    const { result } = renderHook(() => useWorkspaceQuery(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the server\'s WorkspaceView shape', async () => {
    mockFetch({ folder: 'recipes', recipes: [{ file: '/r/books.input.json', kind: 'input', id: 'books', issues: [], text: '{}\n' }] })
    const { result } = renderHook(() => useWorkspaceQuery('recipes'), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data).toEqual({
      folder:  'recipes',
      recipes: [{ file: '/r/books.input.json', kind: 'input', id: 'books', issues: [], text: '{}\n' }],
    })
  })

  it('surfaces the server\'s error message on failure', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'folder not found' }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })
    const { result } = renderHook(() => useWorkspaceQuery('missing'), { wrapper })
    await waitFor(() => { expect(result.current.isError).toBe(true) })
    expect(result.current.error?.message).toBe('folder not found')
  })
})
