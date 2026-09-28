import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useGridViewQuery } from './use-grid-view.hook'

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

describe('useGridViewQuery', () => {
  it('is disabled when the recipe id or the step path is missing, or the extra gate is off', () => {
    const fetchMock = mockFetch({ sheets: [] })
    expect(renderHook(() => useGridViewQuery(undefined, 'start'), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => useGridViewQuery('listino', 'start', false), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the document\'s sheets', async () => {
    mockFetch({ sheets: [{ name: 'listino', hidden: false, hiddenRows: [], columnCount: 2, rows: [], merges: [] }] })
    const { result } = renderHook(() => useGridViewQuery('listino', 'start'), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.sheets).toHaveLength(1)
  })

  it('sends the delimiter/encoding override in the request body', async () => {
    const fetchMock = mockFetch({ sheets: [] })
    renderHook(() => useGridViewQuery('listino', 'start', true, { delimiter: ',', encoding: 'utf8' }), { wrapper })
    await waitFor(() => { expect(fetchMock).toHaveBeenCalled() })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as { delimiter?: string, encoding?: string }
    expect(body).toMatchObject({ delimiter: ',', encoding: 'utf8' })
  })
})
