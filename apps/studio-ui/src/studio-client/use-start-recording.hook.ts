import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { useRecordingStore } from '../studio-store'
import { useStudioClient } from './use-studio-client.hook'

export interface StartRecordingInput {
  recipeId: string
  /** The recipe's own start point (`start[0].url`) — the same URL `handleStartRecording` opens the headed window on server-side; kept here so "make this the login"/"keep as steps" can restore it with a `goto` once recording stops (`content-pane/recording-conversion.mapper.ts`). */
  startUrl: string
}

/**
 * Starts a recording (`start-recording`): opens the studio's own headed
 * browser window on the recipe's start point (issue #95, phase 6).
 * `recording-card`/`recording-note` events keep streaming over the
 * WebSocket after this resolves — see `use-studio-events.ts`, which appends
 * them to `recording.store.ts` — so `active` flips true optimistically in
 * `onMutate` (mirroring `use-run-sample.hook.ts`'s own `startRun()`) and
 * only flips false again on `onError` here or on the WebSocket's
 * `recording-stopped`.
 *
 * @returns The mutation; call `.mutate({ recipeId, startUrl })`. Resolves to `void`: `StudioClient.startRecording`
 * already discards the server's `{ started: true }` ack.
 */
export function useStartRecordingMutation (): UseMutationResult<void, Error, StartRecordingInput> {
  const client = useStudioClient()
  const startRecording = useRecordingStore(state => state.startRecording)
  const failStart = useRecordingStore(state => state.failStart)

  return useMutation({
    mutationFn: async ({ recipeId }: StartRecordingInput) => { await client.startRecording(recipeId) },
    onMutate:   ({ recipeId, startUrl }) => { startRecording(recipeId, startUrl) },
    onError:    (error) => {
      failStart(error instanceof Error ? error.message : String(error))
    },
  })
}
