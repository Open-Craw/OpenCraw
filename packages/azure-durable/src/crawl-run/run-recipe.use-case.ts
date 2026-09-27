import { createCrawler, loadRecipes, memorySink } from '@opencraw/core'
import type { RecipeReport } from '@opencraw/core'
import { crawlOptionsFor } from '../host-options'
import type { HostSettings } from '../host-options'
import { packRecords } from '../result-store'
import type { RecipeTask, RecipeTaskResult } from './crawl-job.model'

/**
 * The `/crawl` activity: one input recipe, on a crawler of its own, limited
 * to the caller's hosts. A recipe that fails is reported, not thrown: the
 * orchestration still gathers the others.
 *
 * @param settings - The host settings.
 * @param task - The recipe and where its records go.
 * @returns Its reports (one per matrix variant) and records (or their link).
 */
export async function runRecipeTask (settings: HostSettings, task: RecipeTask): Promise<RecipeTaskResult> {
  const sink = memorySink()
  const crawler = createCrawler({ ...crawlOptionsFor(settings, task.allowedHosts), sink, dedupe: task.dedupe ?? 'recipe' })
  let reports: RecipeReport[]
  try {
    const set = await loadRecipes([task.output, task.input])
    const result = await crawler.run(set)
    reports = result.recipes
  } finally {
    await crawler.close()
  }
  const packed = await packRecords(sink.records, { store: settings.results, inlineLimitBytes: settings.inlineLimitBytes, name: task.resultName })

  return { reports, ...packed }
}
