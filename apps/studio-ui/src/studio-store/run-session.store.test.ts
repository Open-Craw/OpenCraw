import { act } from '@testing-library/react'
import { resetRunSessionStore, useRunSessionStore } from './run-session.store'

beforeEach(() => { resetRunSessionStore() })

describe('useRunSessionStore', () => {
  it('starts idle with no records or trace', () => {
    const state = useRunSessionStore.getState()
    expect(state.running).toBe(false)
    expect(state.records).toEqual([])
    expect(state.traceLines).toEqual([])
    expect(state.error).toBeUndefined()
  })

  it('startRun marks it running and clears any previous output or error', () => {
    act(() => {
      useRunSessionStore.getState().appendTraceLine('old line')
      useRunSessionStore.getState().setError('boom')
    })
    act(() => { useRunSessionStore.getState().startRun() })
    const state = useRunSessionStore.getState()
    expect(state.running).toBe(true)
    expect(state.records).toEqual([])
    expect(state.traceLines).toEqual([])
    expect(state.error).toBeUndefined()
  })

  it('appendTraceLine appends in order', () => {
    act(() => {
      useRunSessionStore.getState().appendTraceLine('one')
      useRunSessionStore.getState().appendTraceLine('two')
    })
    expect(useRunSessionStore.getState().traceLines).toEqual(['one', 'two'])
  })

  it('appendRecord appends in order', () => {
    act(() => {
      useRunSessionStore.getState().appendRecord({ key: 'a', data: { name: 'Widget' } })
      useRunSessionStore.getState().appendRecord({ key: 'b', data: { name: 'Gadget' } })
    })
    expect(useRunSessionStore.getState().records).toEqual([
      { key: 'a', data: { name: 'Widget' } },
      { key: 'b', data: { name: 'Gadget' } },
    ])
  })

  it('appendRejected appends in order', () => {
    act(() => {
      useRunSessionStore.getState().appendRejected({ field: 'price', reason: 'missing' })
    })
    expect(useRunSessionStore.getState().rejected).toEqual([{ field: 'price', reason: 'missing' }])
  })

  it('finishRun stops running without touching what was collected', () => {
    act(() => {
      useRunSessionStore.getState().startRun()
      useRunSessionStore.getState().appendRecord({ key: 'a', data: {} })
    })
    act(() => { useRunSessionStore.getState().finishRun() })
    const state = useRunSessionStore.getState()
    expect(state.running).toBe(false)
    expect(state.records).toHaveLength(1)
  })

  it('setError records a message an onError handler can show', () => {
    act(() => { useRunSessionStore.getState().setError('could not start') })
    expect(useRunSessionStore.getState().error).toBe('could not start')
  })
})
