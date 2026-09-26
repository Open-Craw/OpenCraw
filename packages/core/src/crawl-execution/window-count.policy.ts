/** How an item ended, for the pool: `neutral` counts neither for nor against the site. */
export type WorkOutcome = 'success' | 'failure' | 'neutral'

/** How many windows a worker pool runs, and how that number moves. */
export interface WindowsPolicy {
  /** Never fewer. Default 1. */
  min?:     number
  /** Never more. Default `min`: a fixed pool. */
  max?:     number
  /** Where it starts. Default `min`. */
  start?:   number
  /** One more window after this many successes in a row. Default 10. */
  grow?:    { after?: number }
  /** On a failure: one window fewer, or half of them. Default `half`. */
  shrink?:  'one' | 'half'
  /** After this many failures in a row, restart the browser and go back to `min`. Default: never. */
  restart?: { after?: number }
}

export interface ResolvedWindowsPolicy {
  min:           number
  max:           number
  start:         number
  growAfter:     number
  shrink:        'one' | 'half'
  restartAfter?: number
}

/** A change the pool must carry out. */
export type WindowCountChange =
  | { kind: 'grow', from: number, to: number, reason: string } |
  { kind: 'shrink', from: number, to: number, reason: string } |
  { kind: 'restart', from: number, to: number, reason: string }

const DEFAULT_GROW_AFTER = 10

/**
 * The policy with its defaults, `windows: 4` meaning a fixed pool of four.
 *
 * @param policy - A number or the policy.
 * @returns The resolved policy.
 * @throws Error when the bounds cannot hold.
 */
export function resolveWindowsPolicy (policy: WindowsPolicy | number = 1): ResolvedWindowsPolicy {
  const given: WindowsPolicy = typeof policy === 'number' ? { min: policy } : policy
  const min = given.min ?? 1
  const max = given.max ?? Math.max(min, given.start ?? min)
  const start = given.start ?? min
  if (!Number.isSafeInteger(min) || min < 1) throw new Error(`windows.min must be a whole number from 1, got ${min}`)
  if (!Number.isSafeInteger(max) || max < min) throw new Error(`windows.max must be a whole number from windows.min (${min}), got ${max}`)
  if (!Number.isSafeInteger(start) || start < min || start > max) throw new Error(`windows.start must be between ${min} and ${max}, got ${start}`)

  return { min, max, start, growAfter: given.grow?.after ?? DEFAULT_GROW_AFTER, shrink: given.shrink ?? 'half', ...(given.restart?.after !== undefined && { restartAfter: given.restart.after }) }
}

/**
 * The number of windows a pool aims for, moved by how items end: additive
 * increase, multiplicative (or one-by-one) decrease, as TCP does with its
 * congestion window.
 *
 * One bad moment fails every item in flight, and each failure arriving would
 * shrink the pool again, down to `min`: a waiter who, when one table
 * complains, empties the next table too. So a failure shrinks the pool only
 * when its item started after the last shrink (`generation`); failures of
 * items already in flight at that moment still count towards a restart, but
 * the shrink has already answered them.
 */
export class WindowCount {
  private count: number
  private successes = 0
  private failures = 0
  private shrinks = 0

  constructor (private readonly policy: ResolvedWindowsPolicy) {
    this.count = policy.start
  }

  private succeeded (): WindowCountChange | undefined {
    this.failures = 0
    this.successes += 1
    if (this.successes < this.policy.growAfter) return undefined
    this.successes = 0
    if (this.count >= this.policy.max) return undefined
    this.count += 1

    return { kind: 'grow', from: this.count - 1, to: this.count, reason: `${this.policy.growAfter} successes in a row` }
  }

  private shrunk (): WindowCountChange | undefined {
    const from = this.count
    const to = Math.max(this.policy.min, this.policy.shrink === 'one' ? from - 1 : Math.floor(from / 2))
    this.shrinks += 1
    if (to === from) return undefined
    this.count = to

    return { kind: 'shrink', from, to, reason: 'an item failed' }
  }

  /** The number of windows the pool aims for. */
  get target (): number {
    return this.count
  }

  /** Increases at every shrink: an item remembers it when it starts. */
  get generation (): number {
    return this.shrinks
  }

  /**
   * Counts how an item ended.
   *
   * @param outcome - How it ended.
   * @param generation - `generation` when the item started.
   * @returns The change to carry out, if any.
   */
  record (outcome: WorkOutcome, generation: number): WindowCountChange | undefined {
    if (outcome === 'neutral') return undefined
    if (outcome === 'success') return this.succeeded()
    this.successes = 0
    this.failures += 1
    const { restartAfter, min } = this.policy
    if (restartAfter !== undefined && this.failures >= restartAfter) {
      const from = this.count
      this.failures = 0
      this.count = min
      this.shrinks += 1

      return { kind: 'restart', from, to: min, reason: `${restartAfter} failures in a row` }
    }
    if (generation < this.shrinks) return undefined

    return this.shrunk()
  }

  /** Starts counting again after a restart. */
  reset (): void {
    this.successes = 0
    this.failures = 0
  }
}
