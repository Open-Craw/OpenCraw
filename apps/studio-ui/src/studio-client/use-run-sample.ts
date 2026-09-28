import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import type { SampleBudget } from '@opencraw/studio'
import { useRunSessionStore } from '../studio-store'
import { useStudioClient } from './use-studio-client'

export interface RunSampleInput {
  recipeId: string
  budget?:  SampleBudget
}

/**
 * Starts a sample run (`run-sample`). The mutation itself only resolves once
 * the server has *started* the run, not once it finishes — records and trace
 * lines keep streaming over the WebSocket after that (see
 * `use-studio-events.ts`, which calls `finishRun()` on `run-finished`) — so
 * `running` flips true optimistically in `onMutate` (mirroring the old
 * `app.tsx`'s `setRunning(true)` before the `await`) and only flips false
 * again either on `onError` here or on the WebSocket's `run-finished`.
 *
 * @returns The mutation; call `.mutate({ recipeId, budget })`. Resolves to `void`:
 * `StudioClient.runSample` already discards the server's `{ started: true }` ack.
 */
export function useRunSampleMutation (): UseMutationResult<void, Error, RunSampleInput> {
  const client = useStudioClient()
  const startRun = useRunSessionStore(state => state.startRun)
  const finishRun = useRunSessionStore(state => state.finishRun)
  const setError = useRunSessionStore(state => state.setError)

  return useMutation({
    mutationFn: ({ recipeId, budget }: RunSampleInput) => client.runSample(recipeId, budget),
    onMutate:   () => { startRun() },
    onError:    (error) => {
      finishRun()
      setError(error instanceof Error ? error.message : String(error))
    },
  })
}
