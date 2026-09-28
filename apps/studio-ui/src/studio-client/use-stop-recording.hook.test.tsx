import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from './query-client'
import { useStopRecordingMutation } from './use-stop-recording.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => { withUrl('?token=abc123') })

describe('useStopRecordingMutation', () => {
  it('sends stop-recording; the recorded steps arrive over the WebSocket\'s recording-stopped instead of this response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ steps: [{ type: 'fill', selector: '#user', value: 'alice' }] }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

    const { result } = renderHook(() => useStopRecordingMutation(), { wrapper })
    act(() => { result.current.mutate() })

    await waitFor(() => { expect(result.current.isSuccess).toBe(true) })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'stop-recording' }),
    }))
  })
})
