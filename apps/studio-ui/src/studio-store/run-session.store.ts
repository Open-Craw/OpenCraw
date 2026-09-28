import { create } from 'zustand'
import type { PreviewRecord } from '../preview'

/**
 * The current sample run's live state: streamed over the WebSocket
 * (`trace-line`, `record`, `run-finished`), not fetched by any command —
 * `run-sample` only answers `{ started: true }` once the run has begun, so
 * there is no query response for this data to live in. Kept as its own
 * Zustand store, separate from `studio-ui.store.ts`, because it is reset per
 * run rather than per navigation, and `studio-client/use-studio-events.ts` is
 * the only thing that writes to it besides `useRunSampleMutation`/
 * `useStopRunMutation`.
 */
export interface RunSessionState {
  running:    boolean
  records:    PreviewRecord[]
  traceLines: string[]
  error?:     string
}

export interface RunSessionActions {
  /** A sample run was asked to start: clears the previous run's output and marks it running. */
  startRun:        () => void
  appendTraceLine: (line: string) => void
  appendRecord:    (record: PreviewRecord) => void
  /** `run-finished` arrived (or the run failed to start): stop showing it as running. */
  finishRun:       () => void
  setError:        (message: string | undefined) => void
}

export type RunSessionStore = RunSessionState & RunSessionActions

export const initialRunSessionState: RunSessionState = {
  running:    false,
  records:    [],
  traceLines: [],
}

export const useRunSessionStore = create<RunSessionStore>((set) => ({
  ...initialRunSessionState,

  startRun:        () => { set({ running: true, records: [], traceLines: [], error: undefined }) },
  appendTraceLine: line => { set(state => ({ traceLines: [...state.traceLines, line] })) },
  appendRecord:    record => { set(state => ({ records: [...state.records, record] })) },
  finishRun:       () => { set({ running: false }) },
  setError:        message => { set({ error: message }) },
}))

/** See `studio-ui.store.ts`'s `initialStudioUiStoreState` for why this snapshot (not the plain data-only `initialRunSessionState`) is what a reset replaces state with. */
const initialRunSessionStoreState = useRunSessionStore.getState()

/** Resets the store to its initial state; call from a test's `beforeEach`. */
export function resetRunSessionStore (): void {
  useRunSessionStore.setState(initialRunSessionStoreState, true)
}
