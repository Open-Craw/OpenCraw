import type { RecipeSet } from '../recipe-loading'
import type { SinkSummary } from '../record-sink'
import type { CrawlReport, RecipeReport } from './crawl-report.model'
import { recipeRuns } from './recipe-matrix.algorithm'
import type { RecipeRun } from './recipe-matrix.algorithm'
import { runInputRecipe } from './run-input-recipe.use-case'
import type { RecipeRunDependencies } from './run-input-recipe.use-case'

/**
 * Runs every input recipe of a set into one sink, `parallel` at a time
 * (default one after another). Reports come back in the set's order whatever
 * order the recipes finish in. Under `onRecipeError: 'stop'`, a failed recipe
 * stops the ones not started yet; those already running finish.
 *
 * @param set - The bound recipes.
 * @param deps - Shared browser, hooks, events, sink and de-duplication.
 * @param onRecipeError - Whether a failed recipe stops the run.
 * @param parallel - How many input recipes run at once.
 * @returns The report.
 */
export async function runCrawl (set: RecipeSet, deps: RecipeRunDependencies, onRecipeError: 'continue' | 'stop', parallel = 1): Promise<CrawlReport> {
  const started = Date.now()
  await deps.sink.open(set.output)
  const reports: (RecipeReport[] | undefined)[] = []
  let sink: SinkSummary
  try {
    let next = 0
    const state = { stopped: false }
    // A lane takes the next recipe and runs its matrix combinations one after another: runs of one recipe share its id in events, so they never overlap.
    const recipes = set.inputs.map(input => recipeRuns(input))
    const lane = async (): Promise<void> => {
      while (!state.stopped && next < recipes.length) {
        const index = next
        next += 1
        reports[index] = await runVariants(recipes[index], { output: set.output, deps, onRecipeError, state })
      }
    }
    const lanes = Math.max(1, Math.min(parallel, recipes.length))
    await Promise.all(Array.from({ length: lanes }, lane))
  } finally {
    sink = await deps.sink.close()
  }
  const recipes = reports.flatMap(runs => runs ?? [])

  return { outputId: set.output.id, recipes, records: recipes.reduce((total, report) => total + report.emitted, 0), sink, durationMs: Date.now() - started }
}

interface VariantContext { output: RecipeSet['output'], deps: RecipeRunDependencies, onRecipeError: 'continue' | 'stop', state: { stopped: boolean } }

/** Runs a recipe once per matrix combination, in order, until the crawl stops. */
async function runVariants (runs: RecipeRun[], { output, deps, onRecipeError, state }: VariantContext): Promise<RecipeReport[]> {
  const reports: RecipeReport[] = []
  for (const run of runs) {
    if (state.stopped) return reports
    const report = await runInputRecipe(run.input, output, deps, run.variant)
    reports.push(report)
    if (onRecipeError === 'stop' && report.error !== undefined) state.stopped = true
  }

  return reports
}
