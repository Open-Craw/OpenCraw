import { bindRecipeSet, createCrawler, memorySink, traceLine } from '@opencraw/core'
import type { Crawler, CrawlEvent } from '@opencraw/core'
import type { SampleBudget } from '../studio-api'
import { loadRecipePair } from './load-recipe-pair.use-case'
import type { SampleRunRecord, SampleRunResult } from './sample-run-record.contract'

/** Where trace lines and records go as a sample run proceeds. */
export interface SampleRunCallbacks {
  onTraceLine: (line: string) => void
  onRecord:    (record: SampleRunRecord) => void
}

/** A sample run in progress. */
export interface SampleRunHandle {
  /** Closes the crawler; the run's `result` still resolves, typically with an error from the interrupted request. */
  stop:   () => Promise<void>
  result: Promise<SampleRunResult>
}

/**
 * Runs one input recipe of a workspace folder as a sample: `debug: true` (so
 * each `record:emit` carries its data), an in-memory sink, and `budget` as
 * the crawler's `sample` (`@opencraw/core`'s `CrawlOptions.sample`, #89).
 * Every engine event becomes a trace line with the same `traceLine`
 * formatter the cli's `--trace` uses; every emitted record reaches
 * `callbacks.onRecord` as it happens, not only in the final result.
 *
 * @param folder - The workspace folder the recipe lives in.
 * @param recipeId - The input recipe to run.
 * @param budget - The sample budget; unset runs the recipe to completion (still capped by its own `limits`).
 * @param callbacks - Where trace lines and records go as the run proceeds.
 * @returns A handle: `stop` closes the crawler cleanly, `result` resolves when the run ends.
 * @throws RecipeValidationError, RecipeBindingError, Error when the recipe or its output cannot be loaded or bound.
 */
export async function runSample (folder: string, recipeId: string, budget: SampleBudget | undefined, callbacks: SampleRunCallbacks): Promise<SampleRunHandle> {
  const { input, output } = await loadRecipePair(folder, recipeId)
  const set = bindRecipeSet(output, [input])
  const sink = memorySink()
  const crawler: Crawler = createCrawler({
    sink,
    debug:   true,
    sample:  budget,
    onEvent: (event: CrawlEvent) => {
      const line = traceLine(event)
      if (line !== undefined) callbacks.onTraceLine(line)
      if (event.type === 'record:emit') callbacks.onRecord({ key: event.key, data: event.data })
    },
  })
  const result = runToResult(crawler, set, sink)

  return { stop: () => crawler.close(), result }
}

async function runToResult (crawler: Crawler, set: Parameters<Crawler['run']>[0], sink: ReturnType<typeof memorySink>): Promise<SampleRunResult> {
  try {
    const report = await crawler.run(set)
    const recipe = report.recipes[0]

    return {
      recipeId:   recipe.recipeId,
      emitted:    recipe.emitted,
      rejected:   recipe.rejected,
      duplicates: recipe.duplicates,
      durationMs: recipe.durationMs,
      error:      recipe.error,
      stoppedBy:  recipe.stoppedBy,
      records:    sink.records.map(record => ({ key: record.key, data: record.data })),
    }
  } finally {
    await crawler.close()
  }
}
