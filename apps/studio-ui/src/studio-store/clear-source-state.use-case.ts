import { resetRecordingStore } from './recording.store'
import { initialRunSessionState, useRunSessionStore } from './run-session.store'
import { useStudioUiStore } from './studio-ui.store'

/**
 * Forgets what belongs to the source that was open: the last run's records, trace and error, a recording in
 * progress, a pick under way and the hovered ids. Called when another document or page is loaded, and by the
 * toolbar's Clear, so nothing of the old source is shown beside the new one.
 */
export function clearSourceState (): void {
  useRunSessionStore.setState({ ...initialRunSessionState, error: undefined })
  resetRecordingStore()
  useStudioUiStore.setState({ pickTarget: undefined, hoveredNodeId: undefined, hoveredStepId: undefined })
}
