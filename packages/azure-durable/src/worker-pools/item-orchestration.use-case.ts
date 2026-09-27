import { callActivity } from '@mnci/az-durable'
import type { TypedActivity } from '@mnci/az-durable'
import type { OrchestrationContext, Task } from 'durable-functions'
import type { ItemJob, ItemOutcome } from './pool-job.model'

/**
 * A pooled item's orchestration: one activity, which hands the item to the
 * warm pool and waits for its result. Durable adds what a plain HTTP call
 * lacks: a status URL to poll past the HTTP time limit, and an instance id
 * that refuses a duplicate while the item runs.
 *
 * @param runItem - The activity.
 * @returns The orchestrator body.
 */
export function itemOrchestrator (runItem: TypedActivity<ItemJob, ItemOutcome>) {
  return function * item (context: OrchestrationContext, job: ItemJob): Generator<Task, ItemOutcome, unknown> {
    return yield * callActivity(context, runItem, job)
  }
}
