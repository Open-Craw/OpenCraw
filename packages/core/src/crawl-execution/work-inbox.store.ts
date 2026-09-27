import type { OutputRecord } from '../output-mapping'
import type { RecipeReport } from './crawl-report.model'
import type { WorkItem, WorkSource } from './work-item.contract'

/** How a submitted item ended: its records when it succeeded, else why not. */
export type WorkItemResult =
  | { outcome: 'success', report: RecipeReport, records: OutputRecord[] } |
  { outcome: 'failure' | 'neutral', report: RecipeReport }

export interface SubmitOptions {
  /** Takes the item back while it is still queued; a running item is not interrupted. */
  signal?: AbortSignal
}

/**
 * A work source fed by pushes: a caller that receives items one at a time (an
 * HTTP request each, a message handler) submits them and gets each item's own
 * result back.
 */
export interface WorkInbox {
  /** Give it to `crawler.work`. */
  readonly source:  WorkSource
  /** Items waiting for a window. */
  readonly queued:  number
  /** Items a window is running. */
  readonly running: number
  /** Windows waiting for an item: while there are any, the pool could take more. */
  readonly idle:    number
  readonly closed:  boolean
  /**
   * Queues an item. An id already queued or running is not run twice: the
   * call returns that item's result.
   *
   * @throws Error (as a rejection) after `close`, or the signal's reason when it aborts first.
   */
  submit (item: WorkItem, options?: SubmitOptions): Promise<WorkItemResult>
  /** No new items. Queued and running items finish, then the pool runs dry and `work` ends. */
  close (): void
  /** Closes and rejects every item not finished yet: for when `work` itself failed. */
  abort (reason?: unknown): void
}

interface Pending {
  item:    WorkItem
  result:  Promise<WorkItemResult>
  resolve: (result: WorkItemResult) => void
  reject:  (reason: unknown) => void
  detach?: () => void
}

/**
 * Creates a push-fed work source. Several windows may wait for an item at
 * once; items and waiting windows are both served first come, first served.
 *
 * Like a restaurant pass: the waiters stand at it until a plate comes up, and
 * each guest gets the plate they ordered, not the next one out.
 *
 * @returns The inbox.
 */
export function createWorkInbox (): WorkInbox {
  const queue: Pending[] = []
  const waiters: ((item: WorkItem | undefined) => void)[] = []
  const byId = new Map<string, Pending>()
  let running = 0
  let closed = false

  const hand = (entry: Pending): WorkItem => {
    entry.detach?.()
    entry.detach = undefined
    running += 1

    return entry.item
  }
  const settle = (item: WorkItem, result: WorkItemResult): void => {
    const entry = byId.get(item.id)
    if (entry === undefined) return
    byId.delete(item.id)
    running -= 1
    entry.resolve(result)
  }
  const close = (): void => {
    closed = true
    // Waiting windows exist only while the queue is empty: nothing is left for them.
    const waiting = [...waiters]
    waiters.length = 0
    for (const wake of waiting) wake(undefined)
  }

  const source: WorkSource = {
    next: async () => {
      const entry = queue.shift()
      if (entry !== undefined) return hand(entry)
      if (closed) return

      return await new Promise<WorkItem | undefined>((resolve) => { waiters.push(resolve) })
    },
    done:   (item, report, records) => { settle(item, { outcome: 'success', report, records }) },
    failed: (item, report, outcome) => { settle(item, { outcome, report }) },
  }

  return {
    source,
    get queued () { return queue.length },
    get running () { return running },
    get idle () { return waiters.length },
    get closed () { return closed },
    async submit (item, options = {}) {
      const known = byId.get(item.id)
      if (known !== undefined) return await known.result
      if (closed) throw new Error(`the inbox is closed: item "${item.id}" was not queued`)
      options.signal?.throwIfAborted()
      const { promise: result, resolve, reject } = Promise.withResolvers<WorkItemResult>()
      const entry: Pending = { item, result, resolve, reject }
      byId.set(item.id, entry)
      const wake = waiters.shift()
      if (wake === undefined) {
        queue.push(entry)
        const signal = options.signal
        if (signal !== undefined) {
          const onAbort = (): void => {
            const at = queue.indexOf(entry)
            if (at === -1) return
            queue.splice(at, 1)
            byId.delete(item.id)
            reject(signal.reason)
          }
          signal.addEventListener('abort', onAbort, { once: true })
          entry.detach = () => { signal.removeEventListener('abort', onAbort) }
        }
      } else {
        wake(hand(entry))
      }

      return await result
    },
    close,
    abort (reason = new Error('the inbox was aborted')) {
      close()
      queue.length = 0
      for (const entry of byId.values()) {
        entry.detach?.()
        entry.reject(reason)
      }
      byId.clear()
      running = 0
    },
  }
}
