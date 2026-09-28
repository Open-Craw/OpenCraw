import { act } from '@testing-library/react'
import { resetStudioUiStore, useStudioUiStore } from './studio-ui.store'

beforeEach(() => { resetStudioUiStore() })

describe('useStudioUiStore', () => {
  it('starts with an empty folder and the steps tab active', () => {
    const state = useStudioUiStore.getState()
    expect(state.folder).toBe('')
    expect(state.openFolder).toBeUndefined()
    expect(state.selectedRecipeId).toBeUndefined()
    expect(state.editorTab).toBe('steps')
  })

  it('setFolder updates the draft folder without opening it', () => {
    act(() => { useStudioUiStore.getState().setFolder('recipes') })
    expect(useStudioUiStore.getState().folder).toBe('recipes')
    expect(useStudioUiStore.getState().openFolder).toBeUndefined()
  })

  it('commitFolder sets both the draft and the open folder', () => {
    act(() => { useStudioUiStore.getState().commitFolder('recipes') })
    expect(useStudioUiStore.getState().folder).toBe('recipes')
    expect(useStudioUiStore.getState().openFolder).toBe('recipes')
  })

  it('selectRecipe sets and clears the selected recipe id', () => {
    act(() => { useStudioUiStore.getState().selectRecipe('books') })
    expect(useStudioUiStore.getState().selectedRecipeId).toBe('books')
    act(() => { useStudioUiStore.getState().selectRecipe(undefined) })
    expect(useStudioUiStore.getState().selectedRecipeId).toBeUndefined()
  })

  it('setEditorTab switches between steps and json', () => {
    act(() => { useStudioUiStore.getState().setEditorTab('json') })
    expect(useStudioUiStore.getState().editorTab).toBe('json')
  })

  it('resetStudioUiStore restores the initial state', () => {
    act(() => {
      useStudioUiStore.getState().commitFolder('recipes')
      useStudioUiStore.getState().selectRecipe('books')
      useStudioUiStore.getState().setEditorTab('json')
    })
    resetStudioUiStore()
    const state = useStudioUiStore.getState()
    expect(state.folder).toBe('')
    expect(state.openFolder).toBeUndefined()
    expect(state.selectedRecipeId).toBeUndefined()
    expect(state.editorTab).toBe('steps')
  })
})
