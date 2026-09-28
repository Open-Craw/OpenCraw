import { act } from '@testing-library/react'
import { resetRecordingStore, useRecordingStore } from './recording.store'

const CARD_NODE = { kind: 'card' as const, path: 'steps.0', stepType: 'fill', sentence: [], custom: false, step: { type: 'fill', selector: '#user', value: 'alice' } }

beforeEach(() => { resetRecordingStore() })

describe('useRecordingStore', () => {
  it('starts inactive with no cards, notes or stopped steps', () => {
    const state = useRecordingStore.getState()
    expect(state.active).toBe(false)
    expect(state.cards).toEqual([])
    expect(state.notes).toEqual([])
    expect(state.stoppedSteps).toBeUndefined()
  })

  it('startRecording marks it active for the recipe/url and clears any previous cards, notes and stopped steps', () => {
    act(() => {
      useRecordingStore.getState().addCard({ node: CARD_NODE, secret: false })
      useRecordingStore.getState().recordingStopped([{ type: 'fill' }])
    })
    act(() => { useRecordingStore.getState().startRecording('login', 'https://example.test/login') })
    const state = useRecordingStore.getState()
    expect(state.active).toBe(true)
    expect(state.recipeId).toBe('login')
    expect(state.startUrl).toBe('https://example.test/login')
    expect(state.cards).toEqual([])
    expect(state.stoppedSteps).toBeUndefined()
  })

  it('addCard appends in order', () => {
    act(() => {
      useRecordingStore.getState().addCard({ node: CARD_NODE, secret: false })
      useRecordingStore.getState().addCard({ node: { ...CARD_NODE, path: 'steps.1' }, secret: true })
    })
    const cards = useRecordingStore.getState().cards
    expect(cards).toHaveLength(2)
    expect(cards[1]?.secret).toBe(true)
  })

  it('addNote appends in order', () => {
    act(() => {
      useRecordingStore.getState().addNote({ kind: 'next-link', message: 'turn this into paginate?' })
    })
    expect(useRecordingStore.getState().notes).toEqual([{ kind: 'next-link', message: 'turn this into paginate?' }])
  })

  it('recordingStopped stops it being active and holds the steps for the make-this-the-login bar', () => {
    act(() => { useRecordingStore.getState().startRecording('login', 'https://example.test/login') })
    act(() => { useRecordingStore.getState().recordingStopped([{ type: 'fill', selector: '#user', value: 'alice' }]) })
    const state = useRecordingStore.getState()
    expect(state.active).toBe(false)
    expect(state.stoppedSteps).toEqual([{ type: 'fill', selector: '#user', value: 'alice' }])
  })

  it('dismissStopped clears the bar and the cards/notes it was showing', () => {
    act(() => {
      useRecordingStore.getState().addCard({ node: CARD_NODE, secret: false })
      useRecordingStore.getState().recordingStopped([{ type: 'fill' }])
    })
    act(() => { useRecordingStore.getState().dismissStopped() })
    const state = useRecordingStore.getState()
    expect(state.stoppedSteps).toBeUndefined()
    expect(state.cards).toEqual([])
    expect(state.notes).toEqual([])
  })

  it('setError records a message an onError handler can show', () => {
    act(() => { useRecordingStore.getState().setError('could not open the browser') })
    expect(useRecordingStore.getState().error).toBe('could not open the browser')
  })
})
