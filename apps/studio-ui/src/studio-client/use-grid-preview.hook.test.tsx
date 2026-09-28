import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useGridPreviewQuery } from './use-grid-preview.hook'

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

describe('useGridPreviewQuery', () => {
  it('is disabled until a recipe, a step path and options are all given', () => {
    const fetchMock = mockFetch({ matches: [] })
    expect(renderHook(() => useGridPreviewQuery(undefined, 'start', { header: '^Marca' }), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => useGridPreviewQuery('listino', 'start', undefined), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the matches', async () => {
    mockFetch({ matches: [{ sheet: 'listino', title: 'Marca', header: ['Marca'], rows: [] }] })
    const { result } = renderHook(() => useGridPreviewQuery('listino', 'start', { header: '^Marca' }), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.matches).toHaveLength(1)
  })
})
