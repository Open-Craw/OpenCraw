import { activityTask, any, resultOf } from '@mnci/az-durable'
import type { TypedActivity, TypedTask } from '@mnci/az-durable'
import type { OrchestrationContext, Task } from 'durable-functions'
import type { CrawlJob, CrawlProgress, CrawlResult, RecipeTask, RecipeTaskResult } from './crawl-job.model'

/**
 * The `/crawl` orchestration: one activity per input recipe, all at once;
 * the custom status counts recipes and records as each one finishes.
 *
 * @param runRecipe - The activity that runs one recipe.
 * @returns The orchestrator body.
 */
export function crawlOrchestrator (runRecipe: TypedActivity<RecipeTask, RecipeTaskResult>) {
  return function * crawl (context: OrchestrationContext, job: CrawlJob): Generator<Task, CrawlResult, unknown> {
    const tasks = job.inputs.map((input, index) => activityTask(context, runRecipe, {
      allowedHosts: job.allowedHosts,
      output:       job.output,
      input,
      resultName:   `${context.df.instanceId}/${index}.jsonl`,
      ...(job.dedupe !== undefined && { dedupe: job.dedupe }),
    }))
    const finished = new Map<TypedTask<RecipeTaskResult>, RecipeTaskResult>()
    const progress: CrawlProgress = { recipes: tasks.length, recipesDone: 0, records: 0 }
    context.df.setCustomStatus(progress)
    let running = tasks
    while (running.length > 0) {
      const winner = yield * any(context, running)
      const result = resultOf(winner)
      finished.set(winner, result)
      running = running.filter(task => task !== winner)
      progress.recipesDone += 1
      progress.records += result.reports.reduce((sum, report) => sum + report.emitted, 0)
      context.df.setCustomStatus(progress)
    }
    const results = tasks.map(task => finished.get(task)).filter(result => result !== undefined)

    return {
      recipes: results.flatMap(result => result.reports),
      records: results.flatMap(result => result.records ?? []),
      results: results.flatMap(result => (result.resultUrl === undefined ? [] : [result.resultUrl])),
    }
  }
}
