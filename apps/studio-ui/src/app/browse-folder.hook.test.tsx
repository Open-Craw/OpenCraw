import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { createStudioQueryClient } from '../studio-client'
import { resetStudioUiStore, useStudioUiStore } from '../studio-store'
import { useBrowseFolderFlow } from './browse-folder.hook'

function answerWith (status: number, body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  history.replaceState({}, '', '/?token=abc123')
  resetStudioUiStore()
})

describe('useBrowseFolderFlow', () => {
  it('opens the folder the dialog answers as the workspace', async () => {
    const fetchMock = answerWith(200, { folder: '/home/ana/recipes' })
    const { result } = renderHook(() => useBrowseFolderFlow(), { wrapper })

    let outcome: string | undefined
    await act(async () => { outcome = await result.current.browse() })

    expect(outcome).toBe('picked')
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({ type: 'choose-folder' })
    expect(useStudioUiStore.getState().openFolder).toBe('/home/ana/recipes')
    expect(useStudioUiStore.getState().folder).toBe('/home/ana/recipes')
    expect(result.current.error).toBeUndefined()
  })

  it('leaves the folder alone when the dialog was closed', async () => {
    answerWith(200, {})
    act(() => { useStudioUiStore.getState().commitFolder('/r') })
    const { result } = renderHook(() => useBrowseFolderFlow(), { wrapper })

    let outcome: string | undefined
    await act(async () => { outcome = await result.current.browse() })

    expect(outcome).toBe('cancelled')
    expect(useStudioUiStore.getState().openFolder).toBe('/r')
  })

  it('says why when the server has no dialog', async () => {
    answerWith(500, { error: 'there is no folder dialog on this machine: type the folder instead' })
    const { result } = renderHook(() => useBrowseFolderFlow(), { wrapper })

    let outcome: string | undefined
    await act(async () => { outcome = await result.current.browse() })

    expect(outcome).toBe('unavailable')
    expect(result.current.error).toContain('type the folder instead')
    expect(result.current.pending).toBe(false)
  })
})
