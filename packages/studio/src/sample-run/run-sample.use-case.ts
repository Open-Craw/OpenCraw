import { stripVTControlCharacters } from 'node:util'
import { UnknownHookError, bindRecipeSet, createCrawler, memorySink, traceLine } from '@opencraw/core'
import type { BrowserSessionConfig, Crawler, CrawlEvent } from '@opencraw/core'
import type { SampleBudget } from '../studio-api'
import type { TrustedPlugins } from '../trusted-plugins'
import { calloutHooks } from './callout-hooks.use-case'
import { loadRecipePair } from './load-recipe-pair.use-case'
import type { SampleRunRecord, SampleRunRejected, SampleRunResult, SampleStepSummary } from './sample-run-record.contract'

/** Where trace lines and records go as a sample run proceeds. */
export interface SampleRunCallbacks {
  onTraceLine: (line: string) => void
  onRecord:    (record: SampleRunRecord) => void
  /** A record was rejected (a field's `skip-record` missing/coercion policy); optional, most callers only need the final `rejectedRecords` list. */
  onRejected?: (rejected: SampleRunRejected) => void
}

/** A sample run in progress. */
export interface SampleRunHandle {
  /** Closes the crawler; the run's `result` still resolves, typically with an error from the interrupted request. */
  stop:   () => Promise<void>
  result: Promise<SampleRunResult>
}

/**
 * Runs one input recipe of a workspace folder as a sample: `debug: true` (so
 * each `record:emit` carries its scope snapshot and mapping trace, and each
 * `record:reject` its scope), an in-memory sink, and `budget` as the
 * crawler's `sample` (`@opencraw/core`'s `CrawlOptions.sample`, #89). Every
 * engine event becomes a trace line with the same `traceLine` formatter the
 * cli's `--trace` uses; every emitted record reaches `callbacks.onRecord` as
 * it happens, not only in the final result. Step events (`step:start`,
 * `step:skip`, `step:retry`) are aggregated by path into `result.steps`, so
 * `explain-why` (#92) can later say whether the step that bound a mapping's
 * source id ran, was skipped, or retried — without a second run.
 *
 * @param folder - The workspace folder the recipe lives in.
 * @param recipeId - The input recipe to run.
 * @param budget - The sample budget; unset runs the recipe to completion (still capped by its own `limits`).
 * @param callbacks - Where trace lines and records go as the run proceeds.
 * @param browser - Browser launch settings for a web-mode recipe (an executable path override, headless…); the server-wide setting `studio-http.use-case.ts`'s `StudioServerOptions.browser` carries in, e.g. `OPENCRAW_CHROMIUM` in a sandbox with no full Playwright install.
 * @param plugins - Hooks, access plugins and captcha solvers the person started Studio with (`--hooks`, issue #150); none when it was started without.
 * @param stubs - Values a hook answers with instead of being called, by hook name, for this run only (issue #201): how a sample skips a slow or paid callout.
 * @returns A handle: `stop` closes the crawler cleanly, `result` resolves when the run ends.
 * @throws RecipeValidationError, RecipeBindingError, Error when the recipe or its output cannot be loaded or bound.
 */
export async function runSample (folder: string, recipeId: string, budget: SampleBudget | undefined, callbacks: SampleRunCallbacks, browser?: BrowserSessionConfig, plugins?: TrustedPlugins, stubs?: Record<string, unknown>): Promise<SampleRunHandle> {
  const { input, output } = await loadRecipePair(folder, recipeId)
  const set = bindRecipeSet(output, [input])
  const sink = memorySink()
  const records: SampleRunRecord[] = []
  const rejectedRecords: SampleRunRejected[] = []
  const steps = new Map<string, SampleStepSummary>()
  const crawler: Crawler = createCrawler({
    sink,
    debug:          true,
    sample:         budget,
    browser,
    hooks:          calloutHooks(plugins?.hooks, stubs, callbacks.onTraceLine),
    accessPlugins:  plugins?.accessPlugins,
    captchaSolvers: plugins?.captchaSolvers,
    onEvent:        (event: CrawlEvent) => {
      const line = traceLine(event)
      if (line !== undefined) callbacks.onTraceLine(line)
      trackStep(steps, event)
      if (event.type === 'record:emit') {
        const record: SampleRunRecord = { key: event.key, data: event.data, scope: event.scope, mapping: event.mapping }
        records.push(record)
        callbacks.onRecord(record)
      } else if (event.type === 'record:reject') {
        const rejected: SampleRunRejected = { field: event.field, reason: event.reason, url: event.url, scope: event.scope }
        rejectedRecords.push(rejected)
        callbacks.onRejected?.(rejected)
      }
    },
  })
  const result = runToResult(crawler, set, recipeId, records, rejectedRecords, steps, plugins)

  return { stop: () => crawler.close(), result }
}

/**
 * Folds one `step:*` event into `steps`, by path: `skip` always wins over an
 * earlier `ran`/`retried` outcome for the same path (a step skipped even
 * once is worth flagging), `retry` wins over a plain `ran`, and a path seen
 * only as `finish`/`start` (no skip, no retry) settles on `ran`. A `forEach`
 * runs its body once per item, so the same path folds repeatedly; this is
 * deliberately a summary across the whole sample, not a per-record trace.
 */
function trackStep (steps: Map<string, SampleStepSummary>, event: CrawlEvent): void {
  if (event.type === 'step:start') {
    if (!steps.has(event.path)) steps.set(event.path, { path: event.path, stepType: event.stepType, stepId: event.stepId, outcome: 'ran' })

    return
  }
  if (event.type === 'step:retry') {
    steps.set(event.path, { path: event.path, stepType: event.stepType, stepId: event.stepId, outcome: 'retried', error: event.error })

    return
  }
  if (event.type === 'step:skip') {
    steps.set(event.path, { path: event.path, stepType: event.stepType, stepId: event.stepId, outcome: 'skipped', error: event.error })
  }
}

/**
 * Awaits the run and shapes its result. A throw from `crawler.run` (an unknown
 * hook, a recipe that cannot start) becomes the run's `error` instead of a
 * rejection: nothing awaits `result` but a `.then`, and an unhandled rejection
 * would take the whole Studio server down (issue #148).
 */
async function runToResult (crawler: Crawler, set: Parameters<Crawler['run']>[0], recipeId: string, records: SampleRunRecord[], rejectedRecords: SampleRunRejected[], steps: Map<string, SampleStepSummary>, plugins?: TrustedPlugins): Promise<SampleRunResult> {
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
      records,
      rejectedRecords,
      // eslint-disable-next-line unicorn/prefer-iterator-to-array -- `.toArray()` needs a `lib` newer than this repo's `es2022` (tsconfig.base.json)
      steps:      [...steps.values()],
    }
  } catch (error) {
    return {
      recipeId,
      emitted:    0,
      rejected:   0,
      duplicates: 0,
      durationMs: 0,
      error:      failureMessage(error, plugins),
      records,
      rejectedRecords,
      // eslint-disable-next-line unicorn/prefer-iterator-to-array -- `.toArray()` needs a `lib` newer than this repo's `es2022` (tsconfig.base.json)
      steps:      [...steps.values()],
    }
  } finally {
    await crawler.close()
  }
}

/** What a run that could not start reports. A hook is the author's own code, which Studio only runs when it was started with `--hooks` (issue #150): say which case this is, instead of leaving "unknown hook" to read as a typo. */
function failureMessage (error: unknown, plugins?: TrustedPlugins): string {
  if (error instanceof UnknownHookError) {
    const message = stripVTControlCharacters(error.message)
    if (plugins !== undefined) return `${message}. It is not one of the hooks in ${plugins.source}: ${Object.keys(plugins.hooks).join(', ') || 'none exported'}.`

    return `${message}. Studio was started without hooks: restart it with \`opencraw studio --hooks <file>\` (a module you trust; it runs as your code), or temporarily replace the hook step to preview the rest.`
  }
  if (error instanceof Error) return stripVTControlCharacters(error.message)

  return stripVTControlCharacters(String(error))
}
