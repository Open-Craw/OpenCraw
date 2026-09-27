import type { OutputRecord, RecipeReport } from '@opencraw/core'

/** What a `/crawl` orchestration runs: written by the starter, never by the caller. */
export interface CrawlJob {
  caller?:      string
  allowedHosts: string[]
  output:       unknown
  inputs:       unknown[]
  dedupe?:      'recipe' | 'off'
}

/** One input recipe of a job, run by one activity. */
export interface RecipeTask {
  allowedHosts: string[]
  output:       unknown
  input:        unknown
  dedupe?:      'recipe' | 'off'
  /** Where its records go when too large to return: `<instance>/<index>.jsonl`. */
  resultName:   string
}

export interface RecipeTaskResult {
  /** One per run: a recipe with a `matrix` runs once per variant. */
  reports:    RecipeReport[]
  records?:   OutputRecord[]
  resultUrl?: string
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
  recipes:     number
  recipesDone: number
  records:     number
}
