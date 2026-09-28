import { create } from 'zustand'
import type { OutlineNode } from '@opencraw/studio'

/** One card `recording-card` reported, still to be resolved into a `secret pill` by `sentence-view.component.tsx`'s own `{{env.NAME}}` pattern match — `secret` rides along too, for anything that later wants the server's own say-so rather than the pattern. */
export interface RecordingCard {
  node:   OutlineNode
  secret: boolean
}

/** A `recording-note` the recorder sent that is not itself a step: a "next" link offer, or an unsupported iframe/shadow-DOM report (issue #95). */
export interface RecordingNote {
  kind:      'next-link' | 'unsupported' | 'info'
  message:   string
  /**
   * For a `next-link` note only: the selector of the click card it followed
   * (`use-studio-events.ts` reads it off the last card in `cards` at the
   * moment the note arrives — `recorder-session.use-case.ts` always reports
   * a click's own card before the note about it, never the other way round),
   * so the Steps outline's "turn into pagination" offer can build the
   * `paginate` bracket without parsing it back out of `message`'s own
   * wording. `undefined` when it could not be resolved (no preceding click
   * card) — the offer then shows the message with no action.
   */
  selector?: string
}

/**
 * The current recording's live state (issue #95, phase 6): streamed over the
 * WebSocket (`recording-card`, `recording-note`, `recording-stopped`), the
 * same way `run-session.store.ts` holds a sample run's live output — there is
 * no query response either could instead live in, since `start-recording`
 * only answers `{ started: true }` once the window is open.
 *
 * `recipeId`/`startUrl` are set by `useStartRecordingMutation`'s own
 * `onMutate` (the recipe the recording was started for, and the URL the
 * headed window opened on — `state.folder`'s recipe `start[0].url`, the same
 * one `handleStartRecording` reads server-side): both are needed once
 * recording stops, to build the `goto` that restores that same start point
 * for "make this the login"'s `session.bootstrap` or "keep as steps"'
 * ordinary `steps` (`content-pane/recording-conversion.mapper.ts`), since
 * neither a fresh bootstrap run nor an appended step list navigates there on
 * its own the way the recording window's own `page.goto` did.
 */
export interface RecordingState {
  active:        boolean
  recipeId?:     string
  startUrl?:     string
  cards:         RecordingCard[]
  notes:         RecordingNote[]
  /** Set once `recording-stopped` arrives (or `stop-recording` resolves): every step recorded, in order, exactly as the server sent them — the "make this the login" / "keep as steps" bar shows while this is set. */
  stoppedSteps?: Record<string, unknown>[]
  error?:        string
}

export interface RecordingActions {
  /** A recording was asked to start: clears the previous recording's cards/notes/steps. */
  startRecording:   (recipeId: string, startUrl: string) => void
  addCard:          (card: RecordingCard) => void
  addNote:          (note: RecordingNote) => void
  /** `recording-stopped` arrived: stop showing it as active, and show the "make this the login" / "keep as steps" bar. */
  recordingStopped: (steps: Record<string, unknown>[]) => void
  /** The bar was resolved (a choice was made, or dismissed): clears the stopped state so it stops showing. */
  dismissStopped:   () => void
  /** `start-recording` itself failed (the window never opened): stop showing it as active, with nothing to offer "make this the login"/"keep as steps" — unlike `recordingStopped`, which always has (possibly zero) real steps from a window that did open. */
  failStart:        (message: string) => void
  setError:         (message: string | undefined) => void
}

export type RecordingStore = RecordingState & RecordingActions

export const initialRecordingState: RecordingState = {
  active: false,
  cards:  [],
  notes:  [],
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  ...initialRecordingState,

  startRecording:   (recipeId, startUrl) => { set({ active: true, recipeId, startUrl, cards: [], notes: [], stoppedSteps: undefined, error: undefined }) },
  addCard:          card => { set(state => ({ cards: [...state.cards, card] })) },
  addNote:          note => { set(state => ({ notes: [...state.notes, note] })) },
  recordingStopped: steps => { set({ active: false, stoppedSteps: steps }) },
  dismissStopped:   () => { set({ stoppedSteps: undefined, cards: [], notes: [] }) },
  failStart:        message => { set({ active: false, error: message }) },
  setError:         message => { set({ error: message }) },
}))

/** See `studio-ui.store.ts`'s `initialStudioUiStoreState` for why this snapshot (not the plain data-only `initialRecordingState`) is what a reset replaces state with. */
const initialRecordingStoreState = useRecordingStore.getState()

/** Resets the store to its initial state; call from a test's `beforeEach`. */
export function resetRecordingStore (): void {
  useRecordingStore.setState(initialRecordingStoreState, true)
}
