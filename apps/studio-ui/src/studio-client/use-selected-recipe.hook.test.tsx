import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { resetStudioUiStore, useStudioUiStore } from '../studio-store'
import { createStudioQueryClient } from './query-client'
import { useInputRecipes, useSelectedRecipe } from './use-selected-recipe.hook'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (body: unknown): void {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })
}

function wrapper ({ children }: PropsWithChildren): React.ReactElement {
  return <QueryClientProvider client={createStudioQueryClient()}>{children}</QueryClientProvider>
}

const WORKSPACE = {
  folder:  'recipes',
  recipes: [
    { file: '/r/books.input.json', kind: 'input', id: 'books', issues: [], text: '{}\n' },
    { file: '/r/book.output.json', kind: 'output', id: 'book', issues: [], text: '{}\n' },
  ],
}

beforeEach(() => {
  withUrl('?token=abc123')
  resetStudioUiStore()
  mockFetch(WORKSPACE)
})

describe('useSelectedRecipe', () => {
  it('is undefined before a workspace is open', () => {
    const { result } = renderHook(() => useSelectedRecipe(), { wrapper })
    expect(result.current).toBeUndefined()
  })

  it('finds the listing matching the store\'s selectedRecipeId, from the workspace query\'s cache', async () => {
    act(() => {
      useStudioUiStore.getState().commitFolder('recipes')
      useStudioUiStore.getState().selectRecipe('books')
    })
    const { result } = renderHook(() => useSelectedRecipe(), { wrapper })
    await waitFor(() => { expect(result.current).toBeDefined() })
    expect(result.current?.file).toBe('/r/books.input.json')
  })
})

describe('useInputRecipes', () => {
  it('keeps only recipes of kind "input"', async () => {
    act(() => { useStudioUiStore.getState().commitFolder('recipes') })
    const { result } = renderHook(() => useInputRecipes(), { wrapper })
    await waitFor(() => { expect(result.current).toHaveLength(1) })
    expect(result.current[0].id).toBe('books')
  })
})
