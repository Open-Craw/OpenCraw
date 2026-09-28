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
   * Phase 2 (#91): the content pane is in pick mode for this recipe/step
   * path when set; `undefined` otherwise. `firstNodeId` holds a first click
   * while the studio waits to see whether a second, similar click follows
   * (list inference) or the person moves on (a single `Read` card).
   */
  pickTarget?:       { recipeId: string, stepPath: string, firstNodeId?: string }
  /** The hidden-elements toggle (studio plan §3.2): shows `data-oc-hidden` nodes, greyed, instead of hiding them from the snapshot view. */
  showHidden:        boolean
  /**
   * Two-way highlight (studio plan §4.1): hovering a Steps card sets
   * `hoveredSelector` (its pill's colour highlights every match in the
   * iframe); hovering an element in the iframe sets `hoveredNodeId` (its
   * card highlights). The two are set by different sides and read by the
   * other, so they are kept apart rather than merged into one field.
   */
  hoveredSelector?:  string
  hoveredNodeId?:    string
}

export interface StudioUiActions {
  setFolder:          (folder: string) => void
  /** Makes `folder` the workspace query's key: what `Open` and the initial `?folder=` both do. */
  commitFolder:       (folder: string) => void
  selectRecipe:       (recipeId: string | undefined) => void
  setEditorTab:       (tab: EditorTab) => void
  /** Puts the content pane in pick mode for one recipe and step path (a `＋` menu's "Read", or the toolbar's pick button). */
  startPicking:       (recipeId: string, stepPath: string) => void
  /** Leaves pick mode: a card was made, or the person cancelled (Escape, toggling pick mode off again). */
  stopPicking:        () => void
  /**
   * Records a click's node id while in pick mode.
   *
   * @returns `'first'` when this was the first click of a new pick (the caller now waits for the field's value / a possible second click); `'second'` with the first id when this completes a pair, ready for `infer-selector` with both ids (the pick target is cleared either way — a fresh pick starts clean).
   */
  registerPick:       (nodeId: string) => { kind: 'first' } | { kind: 'second', firstNodeId: string }
  setShowHidden:      (show: boolean) => void
  setHoveredSelector: (selector: string | undefined) => void
  setHoveredNodeId:   (nodeId: string | undefined) => void
}

export type StudioUiStore = StudioUiState & StudioUiActions

export const initialStudioUiState: StudioUiState = {
  folder:     '',
  editorTab:  'steps',
  showHidden: false,
}

export const useStudioUiStore = create<StudioUiStore>((set, get) => ({
  ...initialStudioUiState,

  setFolder:    folder => { set({ folder }) },
  commitFolder: folder => { set({ folder, openFolder: folder }) },
  selectRecipe: recipeId => { set({ selectedRecipeId: recipeId }) },
  setEditorTab: tab => { set({ editorTab: tab }) },

  startPicking: (recipeId, stepPath) => { set({ pickTarget: { recipeId, stepPath } }) },
  stopPicking:  () => { set({ pickTarget: undefined }) },
  registerPick: (nodeId) => {
    const target = get().pickTarget
    if (target?.firstNodeId === undefined) {
      set({ pickTarget: { ...(target ?? { recipeId: '', stepPath: '' }), firstNodeId: nodeId } })

      return { kind: 'first' }
    }
    const firstNodeId = target.firstNodeId
    set({ pickTarget: undefined })

    return { kind: 'second', firstNodeId }
  },
  setShowHidden:      showHidden => { set({ showHidden }) },
  setHoveredSelector: hoveredSelector => { set({ hoveredSelector }) },
  setHoveredNodeId:   hoveredNodeId => { set({ hoveredNodeId }) },
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
