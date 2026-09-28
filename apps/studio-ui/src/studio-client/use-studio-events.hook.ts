import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRecordingStore, useRunSessionStore } from '../studio-store'
import { useStudioClient } from './use-studio-client.hook'

/**
 * Subscribes to the server's event stream for the lifetime of the app and
 * dispatches each event: `trace-line`/`record`/`run-finished` update
 * `run-session.store.ts` (there is no query response they could instead
 * update — see that store's own doc comment), `recording-card`/`recording-note`/
 * `recording-stopped` update `recording.store.ts` the same way (issue #95,
 * phase 6), and `workspace-changed` invalidates the workspace query, so every
 * connected client (this one included, after its own `save-recipe`/`save-outline`)
 * re-fetches the authoritative workspace. Call once, near the app's root.
 */
export function useStudioEvents (): void {
  const client = useStudioClient()
  const queryClient = useQueryClient()
  const appendTraceLine = useRunSessionStore(state => state.appendTraceLine)
  const appendRecord = useRunSessionStore(state => state.appendRecord)
  const appendRejected = useRunSessionStore(state => state.appendRejected)
  const finishRun = useRunSessionStore(state => state.finishRun)
  const addCard = useRecordingStore(state => state.addCard)
  const addNote = useRecordingStore(state => state.addNote)
  const recordingStopped = useRecordingStore(state => state.recordingStopped)

  useEffect(() => (
    client.subscribe((event) => {
      switch (event.type) {
        case 'trace-line': {
          appendTraceLine(event.line)
          break
        }
        case 'record': {
          appendRecord({ key: event.key, data: event.data, scope: event.scope, mapping: event.mapping })
          break
        }
        case 'record-rejected': {
          appendRejected({ field: event.field, reason: event.reason, scope: event.scope })
          break
        }
        case 'run-finished': {
          finishRun()
          break
        }
        case 'recording-card': {
          addCard({ node: event.node, secret: event.secret })
          break
        }
        case 'recording-note': {
          addNote({ kind: event.kind, message: event.message, selector: event.kind === 'next-link' ? lastClickSelector() : undefined })
          break
        }
        case 'recording-stopped': {
          recordingStopped(event.steps)
          // The recording window closed; the issue's own "Stop… retakes the snapshot after the last step" — the
          // event carries no recipeId to target one query, so every cached snapshot is dropped and refetched on
          // next use, same as `workspace-changed` does for the whole workspace query above.
          void queryClient.invalidateQueries({ queryKey: ['snapshot'] })
          break
        }
        case 'workspace-changed': {
          void queryClient.invalidateQueries({ queryKey: ['workspace'] })
          break
        }
        // No default
      }
    })
  ), [client, queryClient, appendTraceLine, appendRecord, appendRejected, finishRun, addCard, addNote, recordingStopped])
}

/**
 * The selector of the recording's own most recently reported card, when it
 * is a `click` step: `recorder-session.use-case.ts` always reports a click's
 * card (`onCard`) before the `next-link` note about that same click
 * (`onNote`), so this — read imperatively, at the moment the note arrives,
 * not as a subscribed hook value — is the click the offer is about.
 * `.getState()` outside a render is the documented way to read a Zustand
 * store's current value on demand; `apps/studio-ui`'s `tsconfig.app.json`
 * restricts `lib` to `["dom"]`, so indexing is used over `Array#at`.
 */
function lastClickSelector (): string | undefined {
  const cards = useRecordingStore.getState().cards
  // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
  const last = cards[cards.length - 1]
  if (last === undefined || last.node.kind !== 'card' || last.node.stepType !== 'click') return undefined
  const selector = last.node.step.selector

  return typeof selector === 'string' ? selector : undefined
}
