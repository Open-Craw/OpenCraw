import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useImportDocumentMutation } from './use-import-document.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

beforeEach(() => { withUrl('?token=abc123') })

describe('useImportDocumentMutation', () => {
  it('sends import-document with the folder, the name and the base64 bytes, and resolves to the copy\'s path and url', async () => {
    const fetchMock = mockFetch({ path: '/r/report.pdf', url: 'file:///r/report.pdf' })
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useImportDocumentMutation(), { wrapper })
    act(() => { result.current.mutate({ folder: '/r', name: 'report.pdf', bytes: 'JVBERi0=' }) })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(result.current.data).toEqual({ path: '/r/report.pdf', url: 'file:///r/report.pdf' })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'import-document', folder: '/r', name: 'report.pdf', bytes: 'JVBERi0=' }),
    }))
  })
})
