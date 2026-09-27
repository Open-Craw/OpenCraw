import { AccessBroker } from '../access'
import { resolve } from 'node:path'
import { BrowserClient, BrowserProfiles } from '../browser-session'
import { CaptchaSolverRegistry } from '../captcha'
import { EventBus } from '../crawl-events'
import { HookRegistry, UnknownHookError } from '../hooks'
import { HostAllowlist } from '../host-allowlist'
import { hookUses } from '../recipe-loading'
import type { RecipeSet } from '../recipe-loading'
import { DedupePolicy, memorySink } from '../record-sink'
import type { DedupeScope } from '../record-sink'
import { HostThrottle } from '../step-flow'
import type { CrawlOptions } from './crawl-options.config'
import type { CrawlReport } from './crawl-report.model'
import { runCrawl } from './run-crawl.use-case'
import type { RecipeRunDependencies } from './run-input-recipe.use-case'
import type { WorkOptions, WorkReport, WorkSource } from './work-item.contract'
import { WorkPool } from './work-pool.use-case'

/** A configured engine: run recipe sets, then close it to release the browser. */
export interface Crawler {
  /** Runs a recipe set. Rejects with `UnknownHookError`, before any request, when a recipe names a hook nobody registered. */
  run:   (set: RecipeSet) => Promise<CrawlReport>
  /**
   * Worker mode: runs the source's items (a recipe with an item's vars each) on
   * a pool of windows until the source runs dry. Each window keeps its browser
   * context between items; the pool grows and shrinks with `options.windows`.
   * One `run` or `work` at a time per crawler: they share its sink. Unless
   * `dedupe` says otherwise, a key repeats only within one item: the same key
   * in another item is that item's record.
   */
  work:  (set: RecipeSet, source: WorkSource, options?: WorkOptions) => Promise<WorkReport>
  /** Closes the browser if one was launched. Safe to call more than once. */
  close: () => Promise<void>
}

/**
 * Creates a crawler. The browser is launched lazily, on the first recipe or
 * bootstrap that needs it, and shared by every run until `close`.
 *
 * @param options - Hooks, sink, events, browser settings, access, captcha solvers, policies.
 * @returns The crawler.
 * @throws AccessConfigError when the access config cannot work.
 * @throws Error when two captcha solvers share a name, or an allowed host is not a host pattern.
 */
export function createCrawler (options: CrawlOptions = {}): Crawler {
  const sink = options.sink ?? memorySink()
  if (options.resume === true && sink.has === undefined) throw new Error('resume needs a sink that can tell which keys it has (jsonLinesSink with append, memorySink, or a custom sink with `has`)')
  const access = new AccessBroker(options.access, options.accessPlugins)
  const hooks = new HookRegistry(options.hooks)
  const captchaSolvers = new CaptchaSolverRegistry(options.captchaSolvers)
  const hosts = new HostThrottle(options.throttle ?? options.access?.throttle)
  const profiles = new BrowserProfiles(options.profilesDir ?? resolve(options.storageStateDir ?? '.', '.opencraw', 'profiles'), options.browser)
  const events = new EventBus(options.onEvent)
  const allowedHosts = HostAllowlist.of(options.allowedHosts)
  let browser: Promise<BrowserClient> | undefined
  let launched: BrowserClient | undefined
  const start = async (): Promise<BrowserClient> => {
    try {
      launched = await BrowserClient.launch(options.browser)

      return launched
    } catch (error) {
      browser = undefined
      throw error
    }
  }
  // A browser that crashed or was closed under the crawler is launched again on the next need.
  const launch = (): Promise<BrowserClient> => {
    if (launched !== undefined && !launched.isConnected()) {
      browser = undefined
      launched = undefined
    }
    browser ??= start()

    return browser
  }
  const restartBrowser = async (): Promise<void> => {
    const current = browser
    browser = undefined
    launched = undefined
    if (current === undefined) return
    let client: BrowserClient
    try {
      client = await current
    } catch {
      return
    }
    await client.close()
  }
  const deps = (dedupe: DedupeScope = 'run'): RecipeRunDependencies => ({
    browser:         launch,
    hooks,
    events,
    sink,
    dedupe:          new DedupePolicy(options.dedupe ?? dedupe),
    storageStateDir: options.storageStateDir,
    resume:          options.resume === true,
    debug:           options.debug === true,
    access,
    captchaSolvers,
    hosts,
    profiles,
    retry:           options.retry,
    allowedHosts,

    ignoreHTTPSErrors: options.browser?.ignoreHTTPSErrors,
  })

  // A hook the recipes name but nobody registered fails the run before its first request, not hours into it.
  const checkHooks = (set: RecipeSet): void => {
    const unknown = set.inputs.flatMap(input => hookUses(input)).find(use => !hooks.has(use.name))
    if (unknown !== undefined) throw new UnknownHookError(unknown.name, hooks.names(), `${unknown.recipeId} ${unknown.path}`)
  }

  return {
    async work (set, source, workOptions = {}) {
      checkHooks(set)
      await sink.open(set.output)
      // Each item is a run of its recipe, so the `recipe` scope de-duplicates within one item.
      const pool = new WorkPool(set, source, workOptions, { ...deps('recipe'), restartBrowser, browserAlive: () => launched?.isConnected() ?? true })
      let result: Omit<WorkReport, 'sink'>
      try {
        result = await pool.run()
      } catch (error) {
        await sink.close()
        throw error
      }

      return { ...result, sink: await sink.close() }
    },
    async run (set) {
      checkHooks(set)

      return runCrawl(set, deps(), options.onRecipeError ?? 'continue', options.parallel ?? 1)
    },
    async close () {
      const unclosed = await captchaSolvers.close()
      for (const message of unclosed) events.emit({ type: 'warning', recipeId: '', message })
      const launched = browser
      browser = undefined
      if (launched === undefined) return
      const client = await launched
      await client.close()
    },
  }
}
