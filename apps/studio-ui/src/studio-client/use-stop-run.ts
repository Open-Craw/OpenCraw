import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { useStudioClient } from './use-studio-client'

/**
 * Stops the run in progress, if any (`stop-run`). `running` is left alone
 * here: the server still finishes the interrupted run and broadcasts
 * `run-finished` (see `use-studio-events.ts`), which is what actually clears
 * it — stopping does not guarantee an immediate stop.
 *
 * @returns The mutation; call `.mutate()`. Resolves to `void`: `StudioClient.stopRun` already discards the
 * server's `{ stopped: boolean }` ack.
 */
export function useStopRunMutation (): UseMutationResult<void, Error, void> {
  const client = useStudioClient()

  return useMutation({
    mutationFn: () => client.stopRun(),
  })
}
