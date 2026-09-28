import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useInspectPageQuery } from './use-inspect-page.hook'

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

describe('useInspectPageQuery', () => {
  it('is disabled when the recipe id or the step path is missing, or the extra gate is off', () => {
    const fetchMock = mockFetch({ tree: { nodeId: 'n0', tag: 'html', attributes: {}, hidden: false, children: [] }, pageData: [] })
    expect(renderHook(() => useInspectPageQuery(undefined, 'start'), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => useInspectPageQuery('books', 'start', false), { wrapper }).result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves to the tree and the data-in-the-page findings', async () => {
    mockFetch({ tree: { nodeId: 'n0', tag: 'html', attributes: {}, hidden: false, children: [] }, pageData: [{ kind: 'meta', label: 'meta: description', selector: 'meta', selectorKind: 'css', matches: 1, attribute: 'content' }] })
    const { result } = renderHook(() => useInspectPageQuery('books', 'start'), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data?.pageData).toHaveLength(1)
  })
})
