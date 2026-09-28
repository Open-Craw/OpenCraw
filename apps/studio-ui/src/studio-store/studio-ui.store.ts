import { create } from 'zustand'

export type EditorTab = 'steps' | 'json'

/**
 * Client-only UI state that is not server data: the folder box's own text,
 * which folder is actually open (the workspace query's key — see
 * `studio-client/use-workspace.ts`), which recipe and editor tab are
 * selected, and (phase 2 onward) whether the content pane is in pick mode.
 * The workspace itself, a recipe's JSON/outline, sample records and trace
 * lines are server/event data and belong to TanStack Query or
 * `run-session.store.ts`, never here.
 */
export interface StudioUiState {
  /** The toolbar's folder input, live as the person types; not yet "open". */
  folder:            string
  /** The folder the workspace query is actually reading; set by `commitFolder`. */
  openFolder?:       string
  selectedRecipeId?: string
  editorTab:         EditorTab
  /**
   * Phase 2 (#91) lands point-and-click selection on the content pane; its
   * "is a pick in progress, for which field" state belongs here, as its own
   * slice (e.g. `pickTarget?: { recipeId: string, stepPath: string }`), left
   * out for now so phase 2 adds exactly the fields it needs instead of
   * guessing ahead of the design.
   */
}

export interface StudioUiActions {
  setFolder:    (folder: string) => void
  /** Makes `folder` the workspace query's key: what `Open` and the initial `?folder=` both do. */
  commitFolder: (folder: string) => void
  selectRecipe: (recipeId: string | undefined) => void
  setEditorTab: (tab: EditorTab) => void
}

export type StudioUiStore = StudioUiState & StudioUiActions

export const initialStudioUiState: StudioUiState = {
  folder:    '',
  editorTab: 'steps',
}

export const useStudioUiStore = create<StudioUiStore>((set) => ({
  ...initialStudioUiState,

  setFolder:    folder => { set({ folder }) },
  commitFolder: folder => { set({ folder, openFolder: folder }) },
  selectRecipe: recipeId => { set({ selectedRecipeId: recipeId }) },
  setEditorTab: tab => { set({ editorTab: tab }) },
}))

/**
 * The store's state right after creation, actions included: `set`/`get`
 * inside those actions stay bound to this store forever, so replacing state
 * with this snapshot later (a full `setState(..., true)`, not a merge)
 * resets the data fields without losing the actions themselves — a merge
 * alone could not reset `openFolder`/`selectedRecipeId` back to `undefined`,
 * since a merge only overwrites the keys it is given.
 */
const initialStudioUiStoreState = useStudioUiStore.getState()

/** Resets the store to its initial state; call from a test's `beforeEach`. */
export function resetStudioUiStore (): void {
  useStudioUiStore.setState(initialStudioUiStoreState, true)
}
