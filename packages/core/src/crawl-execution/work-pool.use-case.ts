import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import type { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import type { RecipeSet } from '../recipe-loading'
import type { InputRecipe } from '../recipe-schema'
import type { RecipeReport } from './crawl-report.model'
import { errorKindOf } from './error-kind.mapper'
import { openRecipeWindow, runRecipe } from './run-input-recipe.use-case'
import type { RecipeRunDependencies, RecipeWindow } from './run-input-recipe.use-case'
import { resolveWindowsPolicy, WindowCount } from './window-count.policy'
import type { WindowCountChange, WorkOutcome } from './window-count.policy'
import type { WorkItem, WorkOptions, WorkReport, WorkSource } from './work-item.contract'
import { defaultOutcome } from './work-outcome.policy'

/** How long a reused window's `check` element may take to show. */
const CHECK_TIMEOUT_MS = 5000

/** What a lane waiting for work got: an item, the end of the work, or too long a wait. */
const IDLE = Symbol('idle')

/** What a worker pool needs from the crawler besides the run dependencies. */
export interface WorkDependencies extends RecipeRunDependencies {
  /** Closes the browser; the next window opened launches a new one. */
  restartBrowser: () => Promise<void>
  /** Whether the browser (if one was launched) is still there. */
  browserAlive:   () => boolean
}

/** One window of the pool: a numbered lane, its open recipe window, the item it runs. */
interface Lane {
  no:       number
  bus:      EventBus
  window?:  RecipeWindow
  /** The browser generation the window was opened in; a restart makes it stale. */
  epoch:    number
  /** Items the current window ran. */
  items:    number
  current?: string
  /** Whether this lane still counts among the pool's windows. */
  counted:  boolean
}

interface Restart {
  reason:  string
  running: boolean
  done:    Promise<void>
  release: () => void
}

/**
 * Runs work items on a pool of windows until the source runs dry.
 *
 * Each window owns a browser context (or HTTP session) for as long as it
 * lives and takes the next item the moment it is free. The pool aims for a
 * number of windows that success raises and failure lowers, but it never
 * takes a window away from an item: a window leaves only between items, when
 * there are more windows than the pool aims for. A failed item's window is
 * closed and the lane opens a fresh one for its next item. A restart waits
 * until no item is running, then relaunches the browser.
 *
 * Like a restaurant floor: waiters take the next order as soon as their hands
 * are free; when the kitchen falls behind, the manager sends waiters home as
 * they finish their tables, never by pulling a plate from under a guest.
 */
export class WorkPool {
  private readonly count:    WindowCount
  private readonly classify: (report: RecipeReport) => WorkOutcome
  private readonly lanes = new Map<number, Promise<void>>()
  /** Waits for an item that retired lanes gave up on; an item still coming goes to a new lane. */
  private readonly abandoned = new Set<Promise<void>>()
  private readonly tally:    Record<WorkOutcome, number> = { success: 0, failure: 0, neutral: 0 }
  private readonly recipeId: string
  private active = 0
  private busy = 0
  /** Lanes waiting for an item: while any is, the pool has windows to spare. */
  private waiting = 0
  private lanesOpened = 0
  private peak = 0
  private epoch = 0
  private restarts = 0
  private records = 0
  private drained = false
  private fatal:             unknown
  private restart:           Restart | undefined

  constructor (private readonly set: RecipeSet, private readonly source: WorkSource, options: WorkOptions, private readonly deps: WorkDependencies) {
    this.count = new WindowCount(resolveWindowsPolicy(options.windows))
    this.classify = options.classify ?? defaultOutcome
    this.recipeId = set.inputs.length === 1 ? set.inputs[0].id : ''
  }

  private spawn (reason: string, first?: WorkItem): void {
    this.lanesOpened += 1
    const no = this.lanesOpened
    const lane: Lane = { no, bus: this.deps.events.scoped(() => ({ window: no, item: lane.current })), epoch: this.epoch, items: 0, counted: true }
    this.active += 1
    this.peak = Math.max(this.peak, this.active)
    const running = (async (): Promise<void> => {
      try {
        await this.work(lane, reason, first)
      } finally {
        this.lanes.delete(no)
      }
    })()
    this.lanes.set(no, running)
  }

  private async work (lane: Lane, reason: string, first?: WorkItem): Promise<void> {
    let openReason = reason
    let leaving = 'drained'
    let item = first
    try {
      for (;;) {
        if (item === undefined) {
          if (this.leaves(lane)) {
            leaving = 'retire'

            return
          }
          const taken = await this.take(lane)
          if (taken === IDLE) {
            leaving = 'idle'

            return
          }
          if (taken === undefined) return
          item = taken
        }
        await this.enter()
        try {
          openReason = await this.runItem(lane, item, openReason)
        } finally {
          item = undefined
          this.busy -= 1
          this.checkRestart()
        }
      }
    } catch (error) {
      // Nothing above should throw; if it does, stop taking work and report it, rather than leave a lane dead and the pool one short.
      this.fatal ??= error
      this.drained = true
    } finally {
      await this.close(lane, leaving)
      if (lane.counted) this.active -= 1
      lane.counted = false
      this.checkRestart()
    }
  }

  /** Whether the lane should retire now: more windows than the pool aims for. Checked between items only. */
  private leaves (lane: Lane): boolean {
    if (this.drained || this.active <= this.count.target) return false
    // Decided and counted in the same tick, so two lanes cannot both leave for one window too many.
    this.active -= 1
    lane.counted = false

    return true
  }

  /**
   * The lane's next item. With `windows.idle`, a lane that waits too long
   * retires when the pool may lose a window; the item it was waiting for, if
   * the source still sends one, goes to a new lane.
   */
  private async take (lane: Lane): Promise<WorkItem | undefined | typeof IDLE> {
    this.waiting += 1
    try {
      return await this.wait(lane)
    } finally {
      this.waiting -= 1
    }
  }

  private async wait (lane: Lane): Promise<WorkItem | undefined | typeof IDLE> {
    if (this.drained) return undefined
    const idleAfterMs = this.count.idleAfterMs
    const waiting = idleAfterMs === undefined ? undefined : new AbortController()
    let pending: Promise<WorkItem | undefined>
    try {
      pending = this.source.next(waiting === undefined ? undefined : { signal: waiting.signal })
    } catch (error) {
      return this.failTaking(error)
    }
    if (waiting === undefined || idleAfterMs === undefined) {
      try {
        return this.taken(await pending)
      } catch (error) {
        return this.failTaking(error)
      }
    }
    const outcome = (async (): Promise<{ item: WorkItem | undefined } | { error: unknown }> => {
      try {
        return { item: await pending }
      } catch (error) {
        return { error }
      }
    })()
    for (;;) {
      const timer = new AbortController()
      const got = await Promise.race([outcome, delay(idleAfterMs, IDLE, { signal: timer.signal })])
      timer.abort()
      if (got !== IDLE) return 'error' in got ? this.failTaking(got.error) : this.taken(got.item)
      if (this.retiresIdle(lane)) {
        waiting.abort()
        this.abandon(pending)

        return IDLE
      }
    }
  }

  private taken (item: WorkItem | undefined): WorkItem | undefined {
    if (item === undefined) this.drained = true

    return item
  }

  private failTaking (error: unknown): undefined {
    this.fatal ??= error
    this.drained = true

    return
  }

  /** Whether an idle lane may retire now; if so it is counted out in the same tick. */
  private retiresIdle (lane: Lane): boolean {
    if (this.drained || this.active <= this.count.min) return false
    const change = this.count.idle(this.active)
    this.active -= 1
    lane.counted = false
    if (change !== undefined) lane.bus.emit({ type: 'windows:change', recipeId: lane.window?.recipe.id ?? this.recipeId, from: change.from, to: change.to, reason: change.reason })

    return true
  }

  /** A retired lane's wait: a source that ignores the abort may still send an item, which then gets a lane of its own. */
  private abandon (pending: Promise<WorkItem | undefined>): void {
    const settled = this.adopt(pending)
    this.abandoned.add(settled)
    void (async (): Promise<void> => {
      await settled
      this.abandoned.delete(settled)
    })()
  }

  private async adopt (pending: Promise<WorkItem | undefined>): Promise<void> {
    try {
      const item = await pending
      if (item === undefined) this.drained = true
      else this.spawn('late', item)
    } catch {
      // the source took the wait back
    }
  }

  /** Waits out a restart, then counts the lane as running an item, in the same tick. */
  private async enter (): Promise<void> {
    for (;;) {
      if (this.restart === undefined) {
        this.busy += 1

        return
      }
      await this.restart.done
    }
  }

  /** @returns Why the lane's next window would open, if it has to. */
  private async runItem (lane: Lane, item: WorkItem, openReason: string): Promise<string> {
    const started = Date.now()
    const generation = this.count.generation
    lane.current = item.id
    const recipe = this.recipeFor(item)
    if (recipe === undefined) {
      await this.refuse(item, lane.bus)
      lane.current = undefined

      return openReason
    }
    let report: RecipeReport
    let records: Parameters<NonNullable<WorkSource['done']>>[2] = []
    try {
      if (lane.window !== undefined && (lane.epoch !== this.epoch || lane.window.recipe.id !== recipe.id)) await this.close(lane, lane.epoch === this.epoch ? 'recipe' : 'restart')
      if (lane.window !== undefined && !await this.stillRight(lane.window)) {
        await this.close(lane, 'fresh')
        openReason = 'fresh'
      }
      if (lane.window === undefined) {
        lane.window = await openRecipeWindow(recipe, { ...this.deps, events: lane.bus })
        lane.epoch = this.epoch
        lane.items = 0
        lane.bus.emit({ type: 'window:open', recipeId: recipe.id, reason: openReason })
      }
      lane.items += 1
      ;({ report, records } = await runRecipe({ ...recipe, vars: { ...recipe.vars, ...item.vars } }, this.set.output, { ...this.deps, events: lane.bus }, { window: lane.window, item: item.id, variant: item.vars, hold: true }))
    } catch (error) {
      // The window would not open: the item never ran.
      const message = error instanceof Error ? error.message : String(error)
      report = { recipeId: recipe.id, item: item.id, variant: item.vars, mode: recipe.mode, emitted: 0, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 0, pages: 0, durationMs: Date.now() - started, error: message, errorKind: errorKindOf(error) }
    }
    const outcome = this.classify(report)
    this.tally[outcome] += 1
    this.records += report.emitted
    lane.bus.emit({ type: 'item:finish', recipeId: recipe.id, outcome, durationMs: Date.now() - started, ...(report.error !== undefined && { error: report.error }) })
    await this.settle(item, report, records, outcome, lane.bus)
    lane.current = undefined
    this.apply(this.count.record(outcome, generation, this.waiting === 0), lane.bus, recipe.id)
    if (report.errorKind === 'browser' && !this.deps.browserAlive()) this.beginRestart('the browser went away', lane.bus, recipe.id)
    if (outcome !== 'success') {
      // A failed item leaves its page in a state nobody knows: the next item gets a fresh window.
      await this.close(lane, 'fresh')

      return 'fresh'
    }
    const maxItems = lane.window?.recipe.window?.maxItems
    if (maxItems !== undefined && lane.items >= maxItems) {
      await this.close(lane, 'recycle')

      return 'recycle'
    }

    return openReason
  }

  /**
   * Whether a reused window still shows what its memory says: the recipe's
   * `window.check` element must be there. A window that remembers nothing has
   * nothing to check.
   */
  private async stillRight (window: RecipeWindow): Promise<boolean> {
    const check = window.recipe.window?.check
    if (check === undefined || window.memory.size === 0) return true
    try {
      await window.runner.runLeaf({ type: 'wait', selector: check, timeoutMs: CHECK_TIMEOUT_MS }, new ExtractionScope())

      return true
    } catch {
      return false
    }
  }

  private recipeFor (item: WorkItem): InputRecipe | undefined {
    const id = item.recipe ?? (this.set.inputs.length === 1 ? this.set.inputs[0].id : undefined)

    return this.set.inputs.find(input => input.id === id)
  }

  /** An item no recipe of the set can run: a mistake in the work, not the site's health, so the pool does not move. */
  private async refuse (item: WorkItem, bus: EventBus): Promise<void> {
    const error = item.recipe === undefined ? `work item "${item.id}" names no recipe, and the set has ${this.set.inputs.length}` : `work item "${item.id}" names recipe "${item.recipe}", which is not in the set`
    const report: RecipeReport = { recipeId: item.recipe ?? '', item: item.id, variant: item.vars, mode: 'web', emitted: 0, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 0, pages: 0, durationMs: 0, error, errorKind: 'error' }
    this.tally.failure += 1
    bus.emit({ type: 'item:finish', recipeId: report.recipeId, outcome: 'failure', durationMs: 0, error })
    await this.settle(item, report, [], 'failure', bus)
  }

  private async settle (item: WorkItem, report: RecipeReport, records: Parameters<NonNullable<WorkSource['done']>>[2], outcome: WorkOutcome, bus: EventBus): Promise<void> {
    try {
      await (outcome === 'success' ? this.source.done?.(item, report, records) : this.source.failed?.(item, report, outcome))
    } catch (error) {
      bus.emit({ type: 'error', recipeId: report.recipeId, message: `the work source failed to take item "${item.id}" back: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  private apply (change: WindowCountChange | undefined, bus: EventBus, recipeId: string): void {
    if (change === undefined) return
    bus.emit({ type: 'windows:change', recipeId, from: change.from, to: change.to, reason: change.reason })
    if (change.kind === 'grow' && !this.drained) this.spawn('grow')
    if (change.kind === 'restart') this.beginRestart(change.reason, bus, recipeId)
    // A shrink needs nothing more: windows leave as they finish their items.
  }

  private beginRestart (reason: string, bus: EventBus, recipeId: string): void {
    if (this.restart !== undefined) return
    const signal = new EventTarget()
    const done = (async (): Promise<void> => { await once(signal, 'released') })()
    this.restart = { reason, running: false, done, release: () => { signal.dispatchEvent(new Event('released')) } }
    this.checkRestart(bus, recipeId)
  }

  /** Restarts the browser once no item is running; windows waiting for work are left alone and reopen after. */
  private checkRestart (bus: EventBus = this.deps.events, recipeId = this.recipeId): void {
    const restart = this.restart
    if (restart === undefined || restart.running || this.busy > 0) return
    restart.running = true
    void (async (): Promise<void> => {
      try {
        await this.deps.restartBrowser()
      } catch (error) {
        bus.emit({ type: 'warning', recipeId, message: `closing the browser failed: ${error instanceof Error ? error.message : String(error)}` })
      }
      this.epoch += 1
      this.restarts += 1
      this.count.reset()
      bus.emit({ type: 'browser:restart', recipeId, reason: restart.reason })
      this.restart = undefined
      restart.release()
    })()
  }

  private async close (lane: Lane, reason: string): Promise<void> {
    const window = lane.window
    if (window === undefined) return
    lane.window = undefined
    try {
      await window.dispose()
    } catch {
      // already gone with its browser
    }
    lane.bus.emit({ type: 'window:close', recipeId: window.recipe.id, reason })
  }

  /**
   * Works until the source has no more items and every window is done.
   *
   * @returns What the pool did (the sink summary is the caller's).
   * @throws What the source threw, once every running item has finished.
   */
  async run (): Promise<Omit<WorkReport, 'sink'>> {
    const started = Date.now()
    const start = this.count.target
    for (let lane = 0; lane < start; lane += 1) this.spawn('start')
    while (this.lanes.size > 0 || this.abandoned.size > 0) await Promise.race([...this.lanes.values(), ...this.abandoned])
    if (this.fatal !== undefined) throw this.fatal

    return { items: { ...this.tally }, records: this.records, windows: { start, peak: this.peak, final: this.count.target }, restarts: this.restarts, durationMs: Date.now() - started }
  }
}
