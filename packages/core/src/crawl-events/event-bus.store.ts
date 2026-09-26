import type { CrawlEventInput, CrawlListener } from './crawl-event.contract'

/** Fields a scoped bus adds to every event it emits. */
export interface EventStamp { item?: string, window?: number }

/** Fans crawl events out to listeners. A listener that throws never breaks the crawl. */
export class EventBus {
  private readonly listeners = new Set<CrawlListener>()

  constructor (listener?: CrawlListener, private readonly parent?: { bus: EventBus, stamp: () => EventStamp }) {
    if (listener !== undefined) this.listeners.add(listener)
  }

  /**
   * A bus for one part of the crawl (a worker window): what it emits carries
   * `stamp()` at the time of the emit, reaches its own listeners, then this
   * bus. Its listeners hear only its own events.
   *
   * @param stamp - The fields to add, read at every emit.
   * @returns The scoped bus.
   */
  scoped (stamp: () => EventStamp): EventBus {
    return new EventBus(undefined, { bus: this, stamp })
  }

  /** @returns A function that removes the listener. */
  subscribe (listener: CrawlListener): () => void {
    this.listeners.add(listener)

    return () => { this.listeners.delete(listener) }
  }

  emit (input: CrawlEventInput): void {
    const stamped: CrawlEventInput = this.parent === undefined ? input : { ...input, ...definedOf(this.parent.stamp()) }
    const event = { ...stamped, at: new Date().toISOString() }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // A faulty listener is the caller's problem, not the crawl's.
      }
    }
    this.parent?.bus.emit(stamped)
  }
}

function definedOf (stamp: EventStamp): EventStamp {
  return Object.fromEntries(Object.entries(stamp).filter(([, value]) => value !== undefined))
}
