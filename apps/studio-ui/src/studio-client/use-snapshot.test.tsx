import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useSnapshotQuery } from './use-snapshot'

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

describe('useSnapshotQuery', () => {
  it('is disabled when either the recipe id or the step path is missing', () => {
    const fetchMock = mockFetch({ html: '<html></html>', nodeCount: 0, baseUrl: 'https://x/' })
    expect(renderHook(() => useSnapshotQuery(undefined, 'start'), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => useSnapshotQuery('books', undefined), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the rewritten snapshot', async () => {
    mockFetch({ html: '<p data-oc-node="n0">£10</p>', nodeCount: 1, baseUrl: 'https://x/' })
    const { result } = renderHook(() => useSnapshotQuery('books', 'start'), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.nodeCount).toBe(1)
  })
})
