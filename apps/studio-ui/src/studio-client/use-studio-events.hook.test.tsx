import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { resetRecordingStore, resetRunSessionStore, useRecordingStore, useRunSessionStore } from '../studio-store'
import { createStudioQueryClient } from './query-client'
import { useStudioEvents } from './use-studio-events.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

let messageHandler: ((event: { data: string }) => void) | undefined

class FakeWebSocket {
  addEventListener (_type: string, handler: (event: { data: string }) => void): void {
    messageHandler = handler
  }

  close (): void {}
}

function send (event: unknown): void {
  act(() => { messageHandler?.({ data: JSON.stringify(event) }) })
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, configurable: true })
})

beforeEach(() => {
  withUrl('?token=abc123')
  resetRunSessionStore()
  resetRecordingStore()
  messageHandler = undefined
})

describe('useStudioEvents', () => {
  it('appends trace-line events to the run session store', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'trace-line', line: '▶ books' })
    expect(useRunSessionStore.getState().traceLines).toEqual(['▶ books'])
  })

  it('appends record events to the run session store', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'record', recipeId: 'books', key: 'a1', data: { name: 'Widget' } })
    expect(useRunSessionStore.getState().records).toEqual([{ key: 'a1', data: { name: 'Widget' } }])
  })

  it('appends record events\' scope and mapping trace, and record-rejected events, to the run session store', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'record', recipeId: 'books', key: 'a1', data: { price: null }, scope: { vars: {} }, mapping: { price: { from: undefined, steps: [] } } })
    send({ type: 'record-rejected', recipeId: 'books', field: 'title', reason: 'missing', scope: { vars: {} } })

    expect(useRunSessionStore.getState().records).toEqual([{ key: 'a1', data: { price: null }, scope: { vars: {} }, mapping: { price: { from: undefined, steps: [] } } }])
    expect(useRunSessionStore.getState().rejected).toEqual([{ field: 'title', reason: 'missing', scope: { vars: {} } }])
  })

  it('stops the run on run-finished', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    act(() => { useRunSessionStore.getState().startRun() })
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'run-finished', recipeId: 'books', emitted: 1, rejected: 0, duplicates: 0, durationMs: 5 })
    expect(useRunSessionStore.getState().running).toBe(false)
  })

  it('appends recording-card events (with their secret flag) to the recording store', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    const node = { kind: 'card', path: 'steps.0', stepType: 'fill', sentence: [], custom: false, step: { type: 'fill', selector: '#pass', value: '{{env.PASS}}' } }
    send({ type: 'recording-card', node, secret: true })

    expect(useRecordingStore.getState().cards).toEqual([{ node, secret: true }])
  })

  it('appends recording-note events to the recording store', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'recording-note', kind: 'unsupported', message: 'recording inside an iframe is not supported' })

    expect(useRecordingStore.getState().notes).toEqual([{ kind: 'unsupported', message: 'recording inside an iframe is not supported' }])
  })

  it('resolves a next-link note\'s selector off the click card it followed, for the "turn into pagination" offer', () => {
    const queryClient = createStudioQueryClient()
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'recording-card', node: { kind: 'card', path: 'steps.0', stepType: 'click', sentence: [], custom: false, step: { type: 'click', selector: '#next' } }, secret: false })
    send({ type: 'recording-note', kind: 'next-link', message: 'this click looks like a "next" link — turn it into "For every page — click #next"?' })

    expect(useRecordingStore.getState().notes[0]?.selector).toBe('#next')
  })

  it('marks the recording stopped, holds its steps, and drops the cached snapshot(s) on recording-stopped', async () => {
    const queryClient = createStudioQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    act(() => { useRecordingStore.getState().startRecording('login', 'https://example.test/login') })
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'recording-stopped', steps: [{ type: 'fill', selector: '#user', value: 'alice' }] })

    expect(useRecordingStore.getState().active).toBe(false)
    expect(useRecordingStore.getState().stoppedSteps).toEqual([{ type: 'fill', selector: '#user', value: 'alice' }])
    await waitFor(() => { expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshot'] }) })
  })

  it('invalidates the workspace and snapshot queries on workspace-changed (issue #159)', async () => {
    const queryClient = createStudioQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function wrapper ({ children }: PropsWithChildren): React.ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    renderHook(() => { useStudioEvents() }, { wrapper })

    send({ type: 'workspace-changed' })
    await waitFor(() => { expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace'] }) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshot'] })
  })
})
