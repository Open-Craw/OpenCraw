import type { OutputRecord } from '../output-mapping'
import type { VarValue } from '../recipe-schema'
import type { SinkSummary } from '../record-sink'
import type { RecipeReport } from './crawl-report.model'
import type { WindowsPolicy, WorkOutcome } from './window-count.policy'

/** One unit of work: a run of a recipe with these vars (a report for one date, state and filter set). */
export interface WorkItem {
  /** Stamped on the item's events, report and records. */
  id:      string
  /** The vars it runs with, over the recipe's own. */
  vars:    Record<string, VarValue>
  /** Which input recipe of the set runs it; needed only when the set has several. */
  recipe?: string
}

/**
 * Where a worker pool takes its items and reports how each ended. Claiming
 * (a queue, a table with leases, priorities) is the source's business: the
 * pool only asks for the next item when a window is free, from several
 * windows at once.
 */
export interface WorkSource {
  /**
   * The next item; may wait (for a refill). `undefined` means there is no more
   * work. With `windows.idle`, the pool passes a signal that aborts when the
   * waiting window retires: a source that can take the wait back should
   * (rejecting is fine). One that ignores it may still return an item, which
   * then gets a window of its own.
   */
  next (options?: { signal?: AbortSignal }): Promise<WorkItem | undefined>
  /** The item succeeded: its records are written (and given here too, for a source that files them per item). */
  done? (item: WorkItem, report: RecipeReport, records: OutputRecord[]): Promise<void> | void
  /** The item failed (`failure`) or should go back to the queue as it is (`neutral`: a captcha that beat the solver, a browser that died). Nothing of it was written. */
  failed? (item: WorkItem, report: RecipeReport, outcome: Exclude<WorkOutcome, 'success'>): Promise<void> | void
}

export interface WorkOptions {
  /** How many windows, and how that number moves. A number is a fixed pool. Default 1. */
  windows?:  WindowsPolicy | number
  /** How an item ended, for the pool. Default: no error is `success`; a captcha that beat the solver or a browser that closed is `neutral`; any other error is `failure`. */
  classify?: (report: RecipeReport) => WorkOutcome
}

/** What a worker pool did. */
export interface WorkReport {
  items:      Record<WorkOutcome, number>
  /** Records written to the sink. */
  records:    number
  windows:    { start: number, peak: number, final: number }
  /** Browser restarts: after failures in a row, or after the browser went away. */
  restarts:   number
  sink:       SinkSummary
  durationMs: number
}
