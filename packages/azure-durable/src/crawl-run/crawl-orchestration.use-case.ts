import { activityTask, any, defineEvent, eventTask, resultOf, timerTask } from '@mnci/az-durable'
import type { TypedActivity, TypedTask, TypedTimerTask } from '@mnci/az-durable'
import type { CalloutResolution, RecipeReport } from '@opencraw/core'
import type { OrchestrationContext, Task } from 'durable-functions'
import { calloutEventName } from '../callout-resume'
import type { CrawlJob, CrawlProgress, CrawlResult, RecipeTask, RecipeTaskResult } from './crawl-job.model'

export interface CrawlOrchestratorOptions {
  /** How long a recipe waits for the results of parked calls before it fails. Only used when a call parks. */
  waitMs?: number
}

/** A recipe is run again at most this many times for parked calls, so a hook whose key changes every run cannot loop for ever. */
const MAX_RESUMES = 25
const DEFAULT_WAIT_MS = 60 * 60 * 1000

type Owner =
  | { kind: 'recipe', index: number } |
  { kind: 'event', index: number, key: string } |
  { kind: 'timer', index: number }

/** What the orchestration knows about one input recipe while calls of it are parked. */
interface Slot {
  resolutions: Record<string, CalloutResolution>
  waiting:     Set<string>
  events:      TypedTask<unknown>[]
  timer?:      TypedTimerTask
  resumes:     number
  handlers:    string[]
}

/**
 * The `/crawl` orchestration: one activity per input recipe, all at once;
 * the custom status counts recipes and records as each one finishes.
 *
 * A recipe whose hooks answered `pending` and will post their results back stops its activity with
 * `parked` calls. The orchestration then waits for one external event per call (and a timer, so a
 * handler that never answers fails the recipe, not the job) and runs the recipe again with the results
 * so far: calls that have a result return it without being made again.
 *
 * @param runRecipe - The activity that runs one recipe.
 * @param options - How long to wait for posted-back results.
 * @returns The orchestrator body.
 */
export function crawlOrchestrator (runRecipe: TypedActivity<RecipeTask, RecipeTaskResult>, options: CrawlOrchestratorOptions = {}) {
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS

  return function * crawl (context: OrchestrationContext, job: CrawlJob): Generator<Task, CrawlResult, unknown> {
    const slots: Slot[] = job.inputs.map(() => ({ resolutions: {}, waiting: new Set<string>(), events: [], resumes: 0, handlers: [] }))
    const owners = new Map<TypedTask<unknown>, Owner>()
    const outcomes = new Map<number, RecipeTaskResult>()
    const progress: CrawlProgress = { recipes: job.inputs.length, recipesDone: 0, records: 0 }
    let running: TypedTask<unknown>[] = []
    let waitingRecipes = 0

    const start = (index: number): void => {
      const slot = slots[index]
      const task = activityTask(context, runRecipe, {
        allowedHosts: job.allowedHosts,
        output:       job.output,
        input:        job.inputs[index],
        resultName:   `${context.df.instanceId}/${String(index)}.jsonl`,
        instanceId:   context.df.instanceId,
        index,
        ...(job.dedupe !== undefined && { dedupe: job.dedupe }),
        ...(job.callbackBase !== undefined && { callbackBase: job.callbackBase }),
        ...(Object.keys(slot.resolutions).length > 0 && { resolutions: { ...slot.resolutions } }),
      })
      owners.set(task, { kind: 'recipe', index })
      running.push(task)
    }
    const finish = (index: number, result: RecipeTaskResult): void => {
      outcomes.set(index, result)
      progress.recipesDone += 1
      progress.records += result.reports.reduce((sum, report) => sum + report.emitted, 0)
      context.df.setCustomStatus(progress)
    }
    const stopWaiting = (slot: Slot): void => {
      if (slot.timer !== undefined && !slot.timer.isCompleted()) slot.timer.cancel()
      const stopped = new Set<TypedTask<unknown>>([...slot.events, ...(slot.timer === undefined ? [] : [slot.timer])])
      running = running.filter(task => !stopped.has(task))
      slot.events = []
      slot.timer = undefined
      waitingRecipes -= 1
      progress.recipesWaiting = waitingRecipes
    }

    context.df.setCustomStatus(progress)
    for (let index = 0; index < job.inputs.length; index += 1) start(index)

    while (running.length > 0) {
      const winner = yield * any(context, running)
      running = running.filter(task => task !== winner)
      const owner = owners.get(winner)
      if (owner === undefined) continue
      const slot = slots[owner.index]

      if (owner.kind === 'recipe') {
        const result = resultOf(winner) as RecipeTaskResult
        const parked = result.parked ?? []
        if (parked.length === 0) {
          finish(owner.index, result)
        } else if (slot.resumes >= MAX_RESUMES) {
          finish(owner.index, { reports: [failedReport(job.inputs[owner.index], owner.index, `still waiting for posted-back results after ${String(MAX_RESUMES)} runs: the keys of its calls keep changing`)] })
        } else {
          slot.resumes += 1
          slot.waiting = new Set(parked.map(call => call.idempotencyKey))
          slot.handlers = parked.map(call => call.handler)
          for (const call of parked) {
            const event = eventTask(context, defineEvent<CalloutResolution>(calloutEventName(owner.index, call.idempotencyKey)))
            owners.set(event, { kind: 'event', index: owner.index, key: call.idempotencyKey })
            slot.events.push(event)
            running.push(event)
          }
          slot.timer = timerTask(context, waitMs)
          owners.set(slot.timer, { kind: 'timer', index: owner.index })
          running.push(slot.timer)
          waitingRecipes += 1
          progress.recipesWaiting = waitingRecipes
          context.df.setCustomStatus(progress)
        }
      } else if (owner.kind === 'event') {
        slot.resolutions[owner.key] = resultOf(winner) as CalloutResolution
        slot.waiting.delete(owner.key)
        if (slot.waiting.size === 0) {
          stopWaiting(slot)
          context.df.setCustomStatus(progress)
          start(owner.index)
        }
      } else {
        stopWaiting(slot)
        finish(owner.index, { reports: [failedReport(job.inputs[owner.index], owner.index, `no result was posted back within ${String(waitMs)} ms by ${slot.handlers.join(', ')}`)] })
      }
    }
    const results = job.inputs.flatMap((_, index) => outcomes.get(index) ?? [])

    return {
      recipes: results.flatMap(result => result.reports),
      records: results.flatMap(result => result.records ?? []),
      results: results.flatMap(result => (result.resultUrl === undefined ? [] : [result.resultUrl])),
    }
  }
}

/** The report of a recipe the orchestration gave up on: it never finished a run, so there is nothing from the engine. */
function failedReport (input: unknown, index: number, error: string): RecipeReport {
  const id = typeof input === 'object' && input !== null && 'id' in input && typeof input.id === 'string' ? input.id : `input-${String(index)}`

  return { recipeId: id, mode: 'api', emitted: 0, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 0, pages: 0, durationMs: 0, error }
}
