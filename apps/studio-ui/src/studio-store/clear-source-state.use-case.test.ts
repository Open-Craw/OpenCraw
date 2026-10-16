import { act } from '@testing-library/react'
import { clearSourceState } from './clear-source-state.use-case'
import { resetRecordingStore, useRecordingStore } from './recording.store'
import { resetRunSessionStore, useRunSessionStore } from './run-session.store'
import { resetStudioUiStore, useStudioUiStore } from './studio-ui.store'

beforeEach(() => {
  resetRunSessionStore()
  resetRecordingStore()
  resetStudioUiStore()
})

describe('clearSourceState', () => {
  it('forgets the last run, a recording, a pick and the hovered ids, and keeps the open folder and recipe', () => {
    act(() => {
      useRunSessionStore.getState().appendRecord({ key: null, data: { a: 1 } })
      useRunSessionStore.getState().appendTraceLine('line')
      useRunSessionStore.getState().setError('boom')
      useRecordingStore.getState().startRecording('r', 'https://x.test')
      useStudioUiStore.setState({ openFolder: '/w', selectedRecipeId: 'r', hoveredStepId: 's', hoveredNodeId: 'n', pickTarget: { recipeId: 'r', stepPath: 'steps.0' } })
    })

    act(() => { clearSourceState() })

    expect(useRunSessionStore.getState().records).toEqual([])
    expect(useRunSessionStore.getState().traceLines).toEqual([])
    expect(useRunSessionStore.getState().error).toBeUndefined()
    expect(useRecordingStore.getState().active).toBe(false)
    expect(useStudioUiStore.getState()).toMatchObject({ openFolder: '/w', selectedRecipeId: 'r', hoveredStepId: undefined, hoveredNodeId: undefined, pickTarget: undefined })
  })
})
