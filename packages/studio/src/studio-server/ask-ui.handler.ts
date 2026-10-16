import type { AskUiCommand, AskUiView } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/**
 * Handles `ask-ui`: tells every open page what a controller (an agent, through the MCP server) asked for, so
 * the person watching sees it happen. Nothing is done server-side: the page does it the way a click would.
 *
 * @param state - The server state holding the connected pages.
 * @param command - What to ask the pages.
 * @returns How many pages were listening; 0 means nobody has Studio open.
 */
export function handleAskUi (state: StudioState, command: AskUiCommand): AskUiView {
  broadcast(state, { type: 'ui-request', request: command.request })

  return { pages: state.sockets.size }
}
