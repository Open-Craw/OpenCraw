import type { StudioStatusView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `studio-status`: what Studio is doing right now.
 *
 * @param state - The server state.
 * @returns The open workspace, how many pages are open and the recipe being sampled.
 */
export function handleStudioStatus (state: StudioState): StudioStatusView {
  return { folder: state.folder, pages: state.sockets.size, running: state.activeRun === undefined ? undefined : state.activeRunId }
}
