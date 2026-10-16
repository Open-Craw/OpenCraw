import { randomUUID } from 'node:crypto'
import type { AskUiCommand, AskUiView, UiOutcomeCommand, UiOutcomeView, UiReportCommand } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/** How many outcomes are kept: a controller asks soon after it sent the request, so a few dozen is plenty. */
const KEPT_OUTCOMES = 50

/**
 * Handles `ask-ui`: tells every open page what a controller (an agent, through the MCP server) asked for, so
 * the person watching sees it happen. Nothing is done server-side: the page does it the way a click would, and
 * says how it went (`ui-report`).
 *
 * @param state - The server state holding the connected pages.
 * @param command - What to ask the pages.
 * @returns How many pages were listening (0 means nobody has Studio open) and the id to ask the outcome with.
 */
export function handleAskUi (state: StudioState, command: AskUiCommand): AskUiView {
  const requestId = randomUUID()
  broadcast(state, { type: 'ui-request', requestId, request: command.request })

  return { pages: state.sockets.size, requestId }
}

/**
 * Handles `ui-report`: a page says how a controller's request went. The first answer stays: every open page gets the
 * request, and a page that has nothing to do with it (another recipe open) does not report.
 *
 * @param state - The server state.
 * @param command - The request's id and the outcome.
 * @returns Whether the report was kept.
 */
export function handleUiReport (state: StudioState, command: UiReportCommand): { kept: boolean } {
  if (state.uiOutcomes.has(command.requestId)) return { kept: false }
  state.uiOutcomes.set(command.requestId, { state: 'done', ok: command.ok, message: command.message, detail: command.detail })
  const [oldest] = state.uiOutcomes.keys()
  if (oldest !== undefined && state.uiOutcomes.size > KEPT_OUTCOMES) state.uiOutcomes.delete(oldest)

  return { kept: true }
}

/**
 * Handles `ui-outcome`: how a controller's request went.
 *
 * @param state - The server state.
 * @param command - The request's id.
 * @returns `pending` until a page reported, then what it said.
 */
export function handleUiOutcome (state: StudioState, command: UiOutcomeCommand): UiOutcomeView {
  return state.uiOutcomes.get(command.requestId) ?? { state: 'pending' }
}
