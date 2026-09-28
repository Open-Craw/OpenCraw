import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { useStudioClient } from './use-studio-client.hook'

/**
 * Stops the recording in progress, if any (`stop-recording`). Mirrors
 * `use-stop-run.hook.ts`: the store is left alone here — the server's own
 * `recording-stopped` broadcast (`use-studio-events.ts`) is what shows the
 * "make this the login" / "keep as steps" bar, for this tab and every other
 * connected one alike, rather than this mutation's own response racing it.
 *
 * @returns The mutation; call `.mutate()`. Resolves to `void`: `StudioClient.stopRecording`'s `{ steps }` is
 * read off the `recording-stopped` event instead.
 */
export function useStopRecordingMutation (): UseMutationResult<void, Error, void> {
  const client = useStudioClient()

  return useMutation({
    mutationFn: async () => { await client.stopRecording() },
  })
}
