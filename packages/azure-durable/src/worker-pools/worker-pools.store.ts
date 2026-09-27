import { createCrawler, createWorkInbox, loadRecipes } from '@opencraw/core'
import type { Crawler, RecordSink, WorkInbox, WorkOutcome, WorkReport } from '@opencraw/core'
import { crawlOptionsFor } from '../host-options'
import type { HostSettings } from '../host-options'
import { findRecipes } from '../recipe-store'
import { packRecords } from '../result-store'
import type { ItemJob, ItemOutcome, PoolState } from './pool-job.model'
import { capWindows } from './windows-cap.policy'

/** A warm pool: one crawler working an inbox, for one caller's crawl id. */
interface Pool {
  key:        string
  crawlId:    string
  recipe:     { name: string, version: string }
  crawler:    Crawler
  inbox:      WorkInbox
  working:    Promise<WorkReport | undefined>
  windows:    number
  ended:      Record<WorkOutcome, number>
  jobSize?:   number
  lastActive: number
}

/** Records go back to each item's caller, so the pool keeps none of its own. */
const discardSink = (): RecordSink => ({ open: async () => {}, write: async () => {}, close: async () => ({ written: 0 }) })

/** How often idle pools are looked for, at most. */
const SWEEP_MS = 30_000

/**
 * The warm worker pools of this process, one per caller and crawl id. A pool
 * is created by its first item, runs `crawler.work` on an inbox, and closes
 * when its job size is reached, when it has had no item for `idleTtlMs`, or
 * when asked. Pools live in this process's memory: a Function App scaled to
 * several instances has one pool per instance for the same crawl id.
 */
export class WorkerPools {
  private readonly pools = new Map<string, Promise<Pool>>()
  /** Each pool's recipe version, known from the moment it starts opening. */
  private readonly versions = new Map<string, { name: string, version: string }>()
  private readonly live = new Map<string, Pool>()
  private sweeper: ReturnType<typeof setInterval> | undefined

  constructor (private readonly settings: HostSettings, private readonly now: () => number = Date.now) {}

  private open (job: ItemJob): Promise<Pool> {
    const current = this.pools.get(job.key)
    if (current !== undefined) return current
    this.versions.set(job.key, job.recipe)
    const opening = this.create(job)
    this.pools.set(job.key, opening)
    void (async (): Promise<void> => {
      try {
        await opening
      } catch {
        this.forget(job.key, opening)
      }
    })()

    return opening
  }

  private async create (job: ItemJob): Promise<Pool> {
    const stored = await findRecipes(this.settings.recipes, job.recipe.name, job.recipe.version)
    const set = await loadRecipes(stored.recipes)
    const windows = capWindows(job.windows ?? this.settings.pools.windows, this.settings.pools.maxWindows, job.jobSize)
    const pool: Pool = {
      key:        job.key,
      crawlId:    job.crawlId,
      recipe:     job.recipe,
      inbox:      createWorkInbox(),
      windows:    windows.start ?? windows.min ?? 1,
      ended:      { success: 0, failure: 0, neutral: 0 },
      lastActive: this.now(),
      working:    Promise.resolve(undefined),
      crawler:    createCrawler({
        ...crawlOptionsFor(this.settings, job.allowedHosts),
        sink:    discardSink(),
        onEvent: (event) => { if (event.type === 'windows:change') pool.windows = event.to },
      }),
      ...(job.jobSize !== undefined && { jobSize: job.jobSize }),
    }
    pool.working = this.work(pool, pool.crawler.work(set, pool.inbox.source, { windows }))
    this.live.set(job.key, pool)
    this.sweep()

    return pool
  }

  /** Waits for a pool to run dry, then closes its browser and forgets it; a pool that failed rejects what it still held. */
  private async work (pool: Pool, working: Promise<WorkReport>): Promise<WorkReport | undefined> {
    try {
      return await working
    } catch (error) {
      pool.inbox.abort(error)

      return undefined
    } finally {
      pool.inbox.close()
      await pool.crawler.close()
      const opening = this.pools.get(pool.key)
      if (opening !== undefined && this.live.get(pool.key) === pool) this.forget(pool.key, opening)
    }
  }

  private forget (key: string, opening: Promise<Pool>): void {
    if (this.pools.get(key) !== opening) return
    this.pools.delete(key)
    this.versions.delete(key)
    this.live.delete(key)
  }

  /** Starts looking for pools that have had no item for `idleTtlMs`, while any is open. */
  private sweep (): void {
    if (this.sweeper !== undefined) return
    const ttl = this.settings.pools.idleTtlMs
    const every = Math.max(1, Math.min(SWEEP_MS, Math.floor(ttl / 2)))
    this.sweeper = setInterval(() => {
      const now = this.now()
      for (const pool of this.live.values()) {
        if (pool.inbox.running === 0 && pool.inbox.queued === 0 && now - pool.lastActive >= ttl) pool.inbox.close()
      }
      if (this.live.size === 0) {
        clearInterval(this.sweeper)
        this.sweeper = undefined
      }
    }, every)
    this.sweeper.unref()
  }

  /**
   * The recipe version a pool runs, if one is open under this key.
   *
   * @param key - The caller and crawl id.
   * @returns The version.
   */
  versionOf (key: string): { name: string, version: string } | undefined {
    return this.versions.get(key)
  }

  /**
   * @param key - The caller and crawl id.
   * @returns The pool as a caller sees it, if one is open.
   */
  state (key: string): PoolState | undefined {
    const pool = this.live.get(key)

    return pool === undefined ? undefined : stateOf(pool)
  }

  /**
   * Runs an item on its job's pool, opening the pool when it is the first.
   *
   * @param job - The item and its job.
   * @returns How it ended, with the pool's state.
   */
  async run (job: ItemJob): Promise<ItemOutcome> {
    const running = this.versions.get(job.key)
    if (running !== undefined && (running.name !== job.recipe.name || running.version !== job.recipe.version)) {
      return { outcome: 'refused', error: `crawl "${job.crawlId}" runs recipes "${running.name}" version "${running.version}"; close it or use another crawl id to run version "${job.recipe.version}"` }
    }
    let pool: Pool
    try {
      pool = await this.open(job)
      // A pool that is closing takes no more items: wait for it to go, and open the job's next one.
      if (pool.inbox.closed) {
        await pool.working
        pool = await this.open(job)
      }
    } catch (error) {
      return { outcome: 'refused', error: error instanceof Error ? error.message : String(error) }
    }
    pool.lastActive = this.now()
    let result: Awaited<ReturnType<WorkInbox['submit']>>
    try {
      result = await pool.inbox.submit(job.item)
    } catch (error) {
      return { outcome: 'failure', error: error instanceof Error ? error.message : String(error), pool: stateOf(pool) }
    } finally {
      pool.lastActive = this.now()
    }
    pool.ended[result.outcome] += 1
    const ended = pool.ended.success + pool.ended.failure + pool.ended.neutral
    if (pool.jobSize !== undefined && ended >= pool.jobSize) pool.inbox.close()
    if (result.outcome !== 'success') return { outcome: result.outcome, report: result.report, ...(result.report.error !== undefined && { error: result.report.error }), pool: stateOf(pool) }
    const packed = await packRecords(result.records, { store: this.settings.results, inlineLimitBytes: this.settings.inlineLimitBytes, name: job.resultName })

    return { outcome: 'success', report: result.report, ...packed, pool: stateOf(pool) }
  }

  /**
   * Closes a pool: queued and running items finish, then its browser closes.
   *
   * @param key - The caller and crawl id.
   * @returns Whether there was a pool to close.
   */
  async close (key: string): Promise<boolean> {
    const opening = this.pools.get(key)
    if (opening === undefined) return false
    let pool: Pool
    try {
      pool = await opening
    } catch {
      return false
    }
    pool.inbox.close()
    await pool.working

    return true
  }

  /** Closes every pool, as the host shuts down. */
  async closeAll (): Promise<void> {
    if (this.sweeper !== undefined) clearInterval(this.sweeper)
    this.sweeper = undefined
    await Promise.all(Array.from(this.pools.keys(), key => this.close(key)))
  }
}

function stateOf (pool: Pool): PoolState {
  return {
    crawlId: pool.crawlId,
    recipe:  pool.recipe,
    windows: pool.windows,
    idle:    pool.inbox.idle,
    queued:  pool.inbox.queued,
    running: pool.inbox.running,
    ended:   { ...pool.ended },
    closing: pool.inbox.closed,
  }
}
