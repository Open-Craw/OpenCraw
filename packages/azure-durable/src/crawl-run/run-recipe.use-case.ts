import { createCrawler, loadRecipes, memorySink, withCalloutWaiter } from '@opencraw/core'
import type { CalloutWaiter, ParkedCallout, RecipeReport } from '@opencraw/core'
import { callbackUrl, signCalloutTicket } from '../callout-resume'
import { crawlOptionsFor } from '../host-options'
import type { HostSettings } from '../host-options'
import { packRecords } from '../result-store'
import type { RecipeTask, RecipeTaskResult } from './crawl-job.model'

const MINUTE_MS = 60_000

/**
 * The `/crawl` activity: one input recipe, on a crawler of its own, limited
 * to the caller's hosts. A recipe that fails is reported, not thrown: the
 * orchestration still gathers the others.
 *
 * When the host takes posted-back results, a hook that answers `pending` parks its call instead of
 * being polled: the run stops and the result says which calls it is waiting for (`parked`), with no
 * reports, because the orchestration runs the recipe again once they have arrived.
 *
 * @param settings - The host settings.
 * @param task - The recipe and where its records go.
 * @param now - The current time, epoch milliseconds (for the token expiry).
 * @returns Its reports (one per matrix variant) and records (or their link), or what it waits for.
 */
export async function runRecipeTask (settings: HostSettings, task: RecipeTask, now: number = Date.now()): Promise<RecipeTaskResult> {
  const sink = memorySink()
  const crawler = createCrawler({ ...crawlOptionsFor(settings, task.allowedHosts), sink, dedupe: task.dedupe ?? 'recipe' })
  const parked: ParkedCallout[] = []
  const waiter = calloutWaiter(settings, task, parked, now)
  let reports: RecipeReport[]
  try {
    const set = await loadRecipes([task.output, task.input])
    const run = async (): Promise<RecipeReport[]> => {
      const result = await crawler.run(set)

      return result.recipes
    }
    reports = waiter === undefined ? await run() : await withCalloutWaiter(waiter, run)
  } finally {
    await crawler.close()
  }
  if (parked.length > 0) return { reports: [], parked }
  const packed = await packRecords(sink.records, { store: settings.results, inlineLimitBytes: settings.inlineLimitBytes, name: task.resultName })

  return { reports, ...packed }
}

/** The waiter of a run, when the host takes posted-back results and the job knows where they go. */
function calloutWaiter (settings: HostSettings, task: RecipeTask, parked: ParkedCallout[], now: number): CalloutWaiter | undefined {
  const callouts = settings.callouts
  if (callouts === undefined || task.callbackBase === undefined) return undefined
  const secret = process.env[callouts.signingKeyEnv] ?? ''
  const base = task.callbackBase
  const expiresAt = now + callouts.waitMs + MINUTE_MS

  return {
    resolutions: task.resolutions ?? {},
    callbackFor: key => ({ url: callbackUrl(base, signCalloutTicket(secret, { instanceId: task.instanceId, index: task.index, key, expiresAt })) }),
    parked,
  }
}
