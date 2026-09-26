import type { WorkItem, WorkSource } from './work-item.contract'

/** A work source over a list, with what happened to each item. */
export interface WorkList extends WorkSource {
  readonly finished: { item: WorkItem, outcome: 'success' | 'failure' | 'neutral' }[]
}

/**
 * A work source over a plain list: each item is handed out once, in order.
 * Items that fail are not retried; `finished` tells how each ended.
 *
 * @param items - The work.
 * @returns The source.
 */
export function workFrom (items: Iterable<WorkItem>): WorkList {
  const queue = [...items]
  const finished: WorkList['finished'] = []

  return {
    finished,
    next:   async () => queue.shift(),
    done:   (item) => { finished.push({ item, outcome: 'success' }) },
    failed: (item, _report, outcome) => { finished.push({ item, outcome }) },
  }
}
