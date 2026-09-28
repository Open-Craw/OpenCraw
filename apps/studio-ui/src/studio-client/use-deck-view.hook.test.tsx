import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useDeckViewQuery } from './use-deck-view.hook'

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

describe('useDeckViewQuery', () => {
  it('is disabled when the recipe id or the step path is missing, or the extra gate is off', () => {
    const fetchMock = mockFetch({ width: 960, height: 540, slides: [] })
    expect(renderHook(() => useDeckViewQuery(undefined, 'start'), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => useDeckViewQuery('incentivi', 'start', false), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the deck\'s slides', async () => {
    mockFetch({ width: 960, height: 540, slides: [{ number: 1, title: 'Incentivi giugno', hidden: false, shapes: [], shapeRows: [], tables: [], charts: [], notes: '' }] })
    const { result } = renderHook(() => useDeckViewQuery('incentivi', 'start'), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.slides).toHaveLength(1)
  })
})
