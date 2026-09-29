import { create } from 'zustand'

export type EditorTab = 'steps' | 'record' | 'json'

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
  /** The Inspect panel's own DOM-tree ↔ snapshot-iframe hover, kept apart from `hoveredStepId` below: a raw DOM node has no step behind it until something has actually been picked there. */
  hoveredNodeId?:    string
  /**
   * The cross-panel highlight (issue #111): a step's own id (its "pill" —
   * `books`, `book`, `title`), the one id space already common to the Steps
   * outline (`OutlineNode.step.id`) and the Record tab's mapping (a rule's
   * `from`, when it is a plain scope id rather than a template or a list).
   * Every panel that participates — the Steps outline, the Record tab, the
   * content pane's snapshot canvas, the records preview table — writes this
   * on hover/select and reads it back, translating it into its own local
   * highlight target (a card, a row, a css selector via the step's own
   * `selector`, a table column) rather than a chain of one-off props between
   * panel pairs. `undefined`: nothing highlighted.
   */
  hoveredStepId?:    string
}

export interface StudioUiActions {
  setFolder:        (folder: string) => void
  /** Makes `folder` the workspace query's key: what `Open` and the initial `?folder=` both do. */
  commitFolder:     (folder: string) => void
  selectRecipe:     (recipeId: string | undefined) => void
  setEditorTab:     (tab: EditorTab) => void
  /** Puts the content pane in pick mode for one recipe and step path (a `＋` menu's "Read", or the toolbar's pick button). */
  startPicking:     (recipeId: string, stepPath: string) => void
  /** Leaves pick mode: a card was made, or the person cancelled (Escape, toggling pick mode off again). */
  stopPicking:      () => void
  /**
   * Records a click's node id while in pick mode.
   *
   * @returns `'first'` when this was the first click of a new pick (the caller now waits for the field's value / a possible second click); `'second'` with the first id when this completes a pair, ready for `infer-selector` with both ids (the pick target is cleared either way — a fresh pick starts clean).
   */
  registerPick:     (nodeId: string) => { kind: 'first' } | { kind: 'second', firstNodeId: string }
  setShowHidden:    (show: boolean) => void
  setHoveredNodeId: (nodeId: string | undefined) => void
  setHoveredStepId: (stepId: string | undefined) => void
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
  setShowHidden:    showHidden => { set({ showHidden }) },
  setHoveredNodeId: hoveredNodeId => { set({ hoveredNodeId }) },
  setHoveredStepId: hoveredStepId => { set({ hoveredStepId }) },
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
