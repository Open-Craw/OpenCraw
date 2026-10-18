import { createCrawler, fileSink, RecipeSet } from '@opencraw/core'
import type { Crawler } from '@opencraw/core'
import { clientHooks } from '../callout-bridge'
import type { AskClient } from '../callout-bridge'
import type { RunParams } from '../protocol'
import { loadRecipes } from './recipe-loading.use-case'
import { streamingSink } from './streaming-sink.repository'

/** Sends a notification to the client. */
export type NotifyClient = (method: string, params: unknown) => void

/** The runs a driver has going, by id, so `cancel` can reach them and `shutdown` close them all. */
export interface RunSessions {
  start:    (params: RunParams) => Promise<string>
  cancel:   (runId: string) => Promise<boolean>
  closeAll: () => Promise<void>
}

/**
 * Starts and tracks runs. `start` loads and binds the recipes (a bad recipe fails the `run` request
 * itself, with its problems), answers with a run id at once, and crawls in the background: every crawl
 * event goes to the client as an `event` notification, every record as a `record` one unless `out`
 * names a file, and the end as `finished` with the report. A hook the client serves is asked back with
 * a `callout` request. `cancel` closes the run's crawler, which stops its recipes; the run still ends
 * with `finished`.
 *
 * @param notify - The channel's notify.
 * @param ask - The channel's request, for callouts.
 * @returns The sessions.
 */
export function runSessions (notify: NotifyClient, ask: AskClient): RunSessions {
  const running = new Map<string, Crawler>()
  let next = 1

  const crawl = async (runId: string, crawler: Crawler, set: RecipeSet): Promise<void> => {
    try {
      const report = await crawler.run(set)
      notify('finished', { runId, report })
    } catch (error) {
      notify('finished', { runId, error: error instanceof Error ? error.message : String(error) })
    } finally {
      running.delete(runId)
      await crawler.close()
    }
  }

  return {
    start: async (params) => {
      const loaded = await loadRecipes(params)
      const set = params.dryRun === true ? new RecipeSet(loaded.output, loaded.inputs.map(input => ({ ...input, limits: { ...input.limits, maxRecords: 1 } }))) : loaded
      const runId = `run-${next++}`
      const crawler = createCrawler({
        sink:     params.out === undefined ? streamingSink() : fileSink(params.out, { append: params.append, browser: { executablePath: params.browser?.executablePath } }),
        hooks:    clientHooks(params.hooks ?? [], runId, ask),
        parallel: params.parallel,
        resume:   params.resume,
        debug:    params.dryRun,
        browser:  { headless: params.browser?.headless ?? true, executablePath: params.browser?.executablePath, ignoreHTTPSErrors: params.browser?.ignoreHTTPSErrors },
        onEvent:  (event) => {
          notify('event', { runId, event })
          if (event.type === 'record:emit' && params.out === undefined) notify('record', { runId, recipeId: event.recipeId, key: event.key, data: event.data })
        },
      })
      running.set(runId, crawler)
      void crawl(runId, crawler, set)

      return runId
    },
    cancel: async (runId) => {
      const crawler = running.get(runId)
      if (crawler === undefined) return false
      running.delete(runId)
      await crawler.close()

      return true
    },
    closeAll: async () => {
      const crawlers = running.values().toArray()
      running.clear()
      await Promise.all(crawlers.map(async crawler => { await crawler.close() }))
    },
  }
}
