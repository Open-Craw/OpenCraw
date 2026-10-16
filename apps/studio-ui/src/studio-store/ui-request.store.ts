import { create } from 'zustand'

/** A controller's request to pick a value on a recipe's web page, waiting for the content pane that shows that recipe's snapshot. */
export interface UiPickRequest {
  requestId: string
  recipeId:  string
  selector?: string
  text?:     string
  /** Add the pick to the recipe once staged, instead of leaving "Add to recipe" for the person. */
  add?:      boolean
}

/** What a controller (an agent, through the MCP server) asked this page to do that needs the content pane, not just the app shell. */
export interface UiRequestState {
  pick?: UiPickRequest
}

export interface UiRequestActions {
  /** A pick was asked for; it stays until the content pane has done it. */
  askPick:    (request: UiPickRequest) => void
  /** The content pane did (or gave up on) the pick with this id. */
  finishPick: (requestId: string) => void
}

export type UiRequestStore = UiRequestState & UiRequestActions

export const useUiRequestStore = create<UiRequestStore>(set => ({
  pick:       undefined,
  askPick:    (request) => { set({ pick: request }) },
  finishPick: (requestId) => { set(state => (state.pick?.requestId === requestId ? { pick: undefined } : state)) },
}))

/** Back to no pending request (for tests). */
export function resetUiRequestStore (): void {
  useUiRequestStore.setState({ pick: undefined })
}
