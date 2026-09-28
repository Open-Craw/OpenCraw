import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useTablePreviewQuery } from './use-table-preview.hook'

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

describe('useTablePreviewQuery', () => {
  it('is disabled until a recipe, a step path and options are all given', () => {
    const fetchMock = mockFetch({ matches: [] })
    expect(renderHook(() => useTablePreviewQuery(undefined, 'start', { header: '^MODELS' }), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => useTablePreviewQuery('discounts', 'start', undefined), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the matches', async () => {
    mockFetch({ matches: [{ page: 1, headerRowIndex: 0, matchedRowIndices: [0, 1], bands: [], bandTolerance: 3, table: { page: 1, title: 'MODELS ALPHA', header: ['MODELS ALPHA'], rows: [] } }] })
    const { result } = renderHook(() => useTablePreviewQuery('discounts', 'start', { header: '^MODELS ALPHA' }), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.matches).toHaveLength(1)
  })
})
