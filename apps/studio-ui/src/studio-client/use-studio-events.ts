import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRunSessionStore } from '../studio-store'
import { useStudioClient } from './use-studio-client'

/**
 * Subscribes to the server's event stream for the lifetime of the app and
 * dispatches each event: `trace-line`/`record`/`run-finished` update
 * `run-session.store.ts` (there is no query response they could instead
 * update — see that store's own doc comment), and `workspace-changed`
 * invalidates the workspace query, so every connected client (this one
 * included, after its own `save-recipe`/`save-outline`) re-fetches the
 * authoritative workspace. Call once, near the app's root.
 */
export function useStudioEvents (): void {
  const client = useStudioClient()
  const queryClient = useQueryClient()
  const appendTraceLine = useRunSessionStore(state => state.appendTraceLine)
  const appendRecord = useRunSessionStore(state => state.appendRecord)
  const finishRun = useRunSessionStore(state => state.finishRun)

  useEffect(() => (
    client.subscribe((event) => {
      switch (event.type) {
        case 'trace-line': {
          appendTraceLine(event.line)
          break
        }
        case 'record': {
          appendRecord({ key: event.key, data: event.data })
          break
        }
        case 'run-finished': {
          finishRun()
          break
        }
        case 'workspace-changed': {
          void queryClient.invalidateQueries({ queryKey: ['workspace'] })
          break
        }
        // No default
      }
    })
  ), [client, queryClient, appendTraceLine, appendRecord, finishRun])
}
