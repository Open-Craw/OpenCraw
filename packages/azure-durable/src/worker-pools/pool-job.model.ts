import type { OutputRecord, RecipeReport, WindowsPolicy, WorkItem, WorkOutcome } from '@opencraw/core'

/** What a pooled item's orchestration runs: written by the starter, never by the caller. */
export interface ItemJob {
  /** The caller and crawl id: one pool per key. */
  key:          string
  crawlId:      string
  allowedHosts: string[]
  recipe:       { name: string, version: string }
  item:         WorkItem
  jobSize?:     number
  windows?:     WindowsPolicy | number
  /** Where the item's records go when too large to return. */
  resultName:   string
}

/** A pool as a caller sees it. */
export interface PoolState {
  crawlId: string
  recipe:  { name: string, version: string }
  /** The windows the pool aims for. */
  windows: number
  /** Windows waiting for an item: while there are any, the caller could send more. */
  idle:    number
  queued:  number
  running: number
  ended:   Record<WorkOutcome, number>
  closing: boolean
}

/** How a pooled item ended. `refused`: the pool would not take it (another recipe version, a missing or draft recipe set). */
export interface ItemOutcome {
  outcome:    WorkOutcome | 'refused'
  report?:    RecipeReport
  records?:   OutputRecord[]
  resultUrl?: string
  error?:     string
  pool?:      PoolState
}
