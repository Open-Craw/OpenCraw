/** One record streamed or kept from a sample run. */
export interface SampleRunRecord {
  key:  string | null
  data: Record<string, unknown>
}

/** A sample run's stopping reason: mirrors `@opencraw/core`'s `RecipeReport.stoppedBy`. */
export type SampleStoppedBy = 'sample-maxRecords' | 'sample-maxPages' | 'sample-maxMs'

/** What a sample run finished with. */
export interface SampleRunResult {
  recipeId:   string
  emitted:    number
  rejected:   number
  duplicates: number
  durationMs: number
  error?:     string
  stoppedBy?: SampleStoppedBy
  records:    SampleRunRecord[]
}
