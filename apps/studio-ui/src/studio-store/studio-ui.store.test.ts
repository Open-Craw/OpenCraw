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

  it('starts with pick mode off and hidden elements off', () => {
    const state = useStudioUiStore.getState()
    expect(state.pickTarget).toBeUndefined()
    expect(state.showHidden).toBe(false)
  })

  it('startPicking/stopPicking turn pick mode on and off for a recipe and step path', () => {
    act(() => { useStudioUiStore.getState().startPicking('books', 'start') })
    expect(useStudioUiStore.getState().pickTarget).toEqual({ recipeId: 'books', stepPath: 'start' })
    act(() => { useStudioUiStore.getState().stopPicking() })
    expect(useStudioUiStore.getState().pickTarget).toBeUndefined()
  })

  it('registerPick: the first click of a pick waits, the second completes the pair and clears pick mode', () => {
    act(() => { useStudioUiStore.getState().startPicking('books', 'start') })
    let outcome
    act(() => { outcome = useStudioUiStore.getState().registerPick('n5') })
    expect(outcome).toEqual({ kind: 'first' })
    expect(useStudioUiStore.getState().pickTarget).toEqual({ recipeId: 'books', stepPath: 'start', firstNodeId: 'n5' })

    act(() => { outcome = useStudioUiStore.getState().registerPick('n12') })
    expect(outcome).toEqual({ kind: 'second', firstNodeId: 'n5' })
    expect(useStudioUiStore.getState().pickTarget).toBeUndefined() // a completed pick leaves pick mode; the next pick starts clean
  })

  it('setShowHidden, setHoveredSelector and setHoveredNodeId each update their own field', () => {
    act(() => { useStudioUiStore.getState().setShowHidden(true) })
    expect(useStudioUiStore.getState().showHidden).toBe(true)
    act(() => { useStudioUiStore.getState().setHoveredSelector('.price') })
    expect(useStudioUiStore.getState().hoveredSelector).toBe('.price')
    act(() => { useStudioUiStore.getState().setHoveredNodeId('n5') })
    expect(useStudioUiStore.getState().hoveredNodeId).toBe('n5')
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
