import type { MappingTrace } from '@opencraw/core'

/**
 * One record streamed or kept from a sample run. `scope` (the snapshot it
 * was mapped from) and `mapping` (each field's source value and its value
 * after every transform, `@opencraw/core`'s `record:emit.mapping`, core
 * since 0.1.12) are always present: `runSample` runs with `debug: true`.
 * Kept per record (studio plan §4.2/§4.4, issue #92) so the Record tab can
 * show a transform chain's real values and the Why? tab can explain a
 * missing one, without a second run.
 */
export interface SampleRunRecord {
  key:      string | null
  data:     Record<string, unknown>
  scope?:   Record<string, unknown>
  mapping?: MappingTrace
}

/** One record a sample run rejected (`RecordRejectedError`, a field's `skip-record` policy), kept for the Why? tab. */
export interface SampleRunRejected {
  field:  string
  reason: string
  url:    string
  scope?: Record<string, unknown>
}

/** A sample run's stopping reason: mirrors `@opencraw/core`'s `RecipeReport.stoppedBy`. */
export type SampleStoppedBy = 'sample-maxRecords' | 'sample-maxPages' | 'sample-maxMs'

/** One outcome of a step during a sample run, aggregated over every time its path ran: whether it ever ran cleanly, was skipped, or retried, kept for the Why? tab (issue #92) — which step bound a mapping's source id, and whether it found nothing. */
export interface SampleStepSummary {
  path:     string
  stepType: string
  stepId?:  string
  as?:      string
  outcome:  'ran' | 'skipped' | 'retried'
  error?:   string
}

/** What a sample run finished with. */
export interface SampleRunResult {
  recipeId:        string
  emitted:         number
  rejected:        number
  duplicates:      number
  durationMs:      number
  error?:          string
  stoppedBy?:      SampleStoppedBy
  records:         SampleRunRecord[]
  rejectedRecords: SampleRunRejected[]
  steps:           SampleStepSummary[]
}
