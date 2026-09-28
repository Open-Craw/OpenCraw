import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { usePdfViewQuery } from './use-pdf-view.hook'

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

describe('usePdfViewQuery', () => {
  it('is disabled when the recipe id or the step path is missing, or the extra gate is off', () => {
    const fetchMock = mockFetch({ pages: [] })
    expect(renderHook(() => usePdfViewQuery(undefined, 'start'), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => usePdfViewQuery('discounts', 'start', false), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the document\'s pages', async () => {
    mockFetch({ pages: [{ number: 1, width: 595, height: 842, rows: [], rowCount: 0, cellCount: 0, hasTextLayer: true }] })
    const { result } = renderHook(() => usePdfViewQuery('discounts', 'start'), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.pages).toHaveLength(1)
  })
})
