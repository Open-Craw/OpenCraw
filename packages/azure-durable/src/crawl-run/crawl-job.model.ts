import type { CalloutResolution, OutputRecord, ParkedCallout, RecipeReport } from '@opencraw/core'

/** What a `/crawl` orchestration runs: written by the starter, never by the caller. */
export interface CrawlJob {
  caller?:       string
  allowedHosts:  string[]
  output:        unknown
  inputs:        unknown[]
  dedupe?:       'recipe' | 'off'
  /** Where handlers post results back (`https://app/api`): set by the starter when the host takes posted-back results. */
  callbackBase?: string
}

/** One input recipe of a job, run by one activity. */
export interface RecipeTask {
  allowedHosts:  string[]
  output:        unknown
  input:         unknown
  dedupe?:       'recipe' | 'off'
  /** Where its records go when too large to return: `<instance>/<index>.jsonl`. */
  resultName:    string
  /** The job's instance and this recipe's index in it: what a resume token names. */
  instanceId:    string
  index:         number
  callbackBase?: string
  /** Results of calls that parked on an earlier run of this recipe, by idempotency key. */
  resolutions?:  Record<string, CalloutResolution>
}

export interface RecipeTaskResult {
  /** One per run: a recipe with a `matrix` runs once per variant. */
  reports:    RecipeReport[]
  records?:   OutputRecord[]
  resultUrl?: string
  /** Set when calls are waiting for their results to be posted back: the run stopped, and this is what it waits for. */
  parked?:    ParkedCallout[]
}

/** What a `/crawl` orchestration returns. */
export interface CrawlResult {
  /** One report per input recipe run (a matrix recipe: per variant), in the order given. */
  recipes: RecipeReport[]
  /** The records returned inline. */
  records: OutputRecord[]
  /** Links to the records too large to return inline, one per recipe that had them. */
  results: string[]
}

/** The orchestration's custom status while it runs. */
export interface CrawlProgress {
  recipes:         number
  recipesDone:     number
  records:         number
  /** Recipes waiting for a posted-back result. Present only when the host takes them. */
  recipesWaiting?: number
}
