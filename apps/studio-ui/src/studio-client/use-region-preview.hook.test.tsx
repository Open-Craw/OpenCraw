import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useRegionPreviewQuery } from './use-region-preview.hook'

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

describe('useRegionPreviewQuery (issue #121)', () => {
  it('is disabled until a recipe, a step path and a selector are all given', () => {
    const fetchMock = mockFetch({ matches: [] })
    expect(renderHook(() => useRegionPreviewQuery(undefined, 'start', 'page=1 x=0..10 y=0..10'), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => useRegionPreviewQuery('discounts', 'start', undefined), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends region-preview with the selector and resolves to the matches', async () => {
    const fetchMock = mockFetch({ matches: [{ page: 1, text: 'DEALER DISCOUNTS', cells: [{ x: 72, y: 800, width: 100, height: 10, text: 'DEALER DISCOUNTS' }] }] })
    const { result } = renderHook(() => useRegionPreviewQuery('discounts', 'start', 'page=1 x=70..180 y=798..812'), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.matches[0].text).toBe('DEALER DISCOUNTS')
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'region-preview', recipeId: 'discounts', path: 'start', selector: 'page=1 x=70..180 y=798..812' }),
    }))
  })
})
