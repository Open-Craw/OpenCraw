import type { HostAllowlist } from '../host-allowlist'
import { AccessConfigError, redactEndpoint } from '../access'
import type { AccessBroker, AccessLease } from '../access'
import { ApiStepRunner } from '../api-steps'
import { BrowserClient } from '../browser-session'
import type { BrowserProfiles } from '../browser-session'
import { CaptchaBudget, CaptchaGuard, CaptchaSolverRegistry, captchaSolverNames, DEFAULT_MAX_SOLVES } from '../captcha'
import type { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import type { HookRegistry } from '../hooks'
import { HttpClient } from '../http-session'
import { mapRecord, RecordRejectedError } from '../output-mapping'
import type { MappingTrace, OutputRecord } from '../output-mapping'
import type { InputRecipe, OutputRecipe, RetryRule, VarValue } from '../recipe-schema'
import type { DedupePolicy, RecordSink } from '../record-sink'
import { resolveRetryRule, RunGate, runSteps, StepMemory } from '../step-flow'
import type { HostThrottle } from '../step-flow'
import type { EmitOutcome, StepRunner } from '../step-flow'
import { WebStepRunner } from '../web-steps'
import { accessOptions, openBrowserProfile, readSavedState, resolveStorageState, runBootstrap } from './bootstrap-session.use-case'
import { RotatingRunner } from './rotating-runner.use-case'
import type { LeasedRunner } from './rotating-runner.use-case'
import type { RecipeReport } from './crawl-report.model'
import { errorKindOf } from './error-kind.mapper'
import type { SampleBudget } from './crawl-options.config'

export interface RecipeRunDependencies {
  browser:            () => Promise<BrowserClient>
  hooks:              HookRegistry
  events:             EventBus
  sink:               RecordSink
  dedupe:             DedupePolicy
  storageStateDir?:   string
  /** Accept invalid TLS certificates in api mode too (sandbox proxies); mirrors `browser.ignoreHTTPSErrors`. */
  ignoreHTTPSErrors?: boolean
  /** Skip records the sink already has (`sink.has`). */
  resume?:            boolean
  /** Attach the scope snapshot to record events. */
  debug?:             boolean
  /** Leases each recipe run its network access. */
  access:             AccessBroker
  /** The solvers recipes name; none when omitted. */
  captchaSolvers?:    CaptchaSolverRegistry
  /** The crawler's per-site throttle, shared by every recipe. */
  hosts?:             HostThrottle
  /** The runner's persistent browser profiles, for `session.browserProfile`. */
  profiles?:          BrowserProfiles
  /** The crawler's retry rule, under each recipe's `limits.retry`. */
  retry?:             RetryRule
  /** The hosts every request may reach, when the crawler limits them. */
  allowedHosts?:      HostAllowlist
  /** A crawler-level budget for a preview run; see `CrawlOptions.sample`. */
  sample?:            SampleBudget
}

/** What every runner of one recipe run shares. */
interface RunContext {
  gate:    RunGate
  solvers: CaptchaSolverRegistry
  budget:  CaptchaBudget
}

/**
 * A recipe's runner kept open across runs: a worker window. Its browser
 * context (or HTTP session), page, access lease and per-run gate stay; each
 * run on it gets its own vars, report and captcha budget.
 */
export interface RecipeWindow {
  /** The recipe it was opened for, retry rule resolved. */
  readonly recipe: InputRecipe
  readonly runner: StepRunner
  readonly gate:   RunGate
  readonly budget: CaptchaBudget
  /** What the window's kept steps left on the page. */
  readonly memory: StepMemory
  dispose (): Promise<void>
}

/** How one run goes: on its own runner (a plain run) or on a window, and whether its records wait for it to succeed. */
export interface RecipeRunOptions {
  /** The vars a `matrix` set or a work item brought, reported with the run. */
  variant?: Record<string, VarValue>
  /** Run on this open window instead of opening (and closing) a runner. */
  window?:  RecipeWindow
  /** The work item this run is, stamped on its report and records. */
  item?:    string
  /** Hold the records back and write them only when the run succeeds: a failed item leaves nothing behind. */
  hold?:    boolean
}

/** A run's report and, when held, the records it wrote. */
export interface RecipeRunResult {
  report:  RecipeReport
  records: OutputRecord[]
}

/**
 * The recipe with the crawler's retry rule under its own.
 *
 * @param recipe - The input recipe.
 * @param deps - The crawler's dependencies.
 * @returns The recipe to run.
 */
function prepared (recipe: InputRecipe, deps: RecipeRunDependencies): InputRecipe {
  return { ...recipe, limits: { ...recipe.limits, retry: resolveRetryRule(recipe.limits?.retry, deps.retry) } }
}

/**
 * Opens a window for a recipe: its access lease and runner (with block
 * rotation, the bootstrap, saved state) and its gate, kept open until
 * `dispose`. Events go to `deps.events`.
 *
 * @param recipe - The input recipe.
 * @param deps - The crawler's dependencies.
 * @returns The window.
 */
export async function openRecipeWindow (recipe: InputRecipe, deps: RecipeRunDependencies): Promise<RecipeWindow> {
  const input = prepared(recipe, deps)
  const limits = input.limits ?? {}
  const context = runContext(input, deps, new RunGate(limits.concurrency ?? 1, limits.delayMs ?? 0, deps.hosts))
  const runner = await openRotating(input, deps, context)

  return { recipe: input, runner, gate: context.gate, budget: context.budget, memory: new StepMemory(), dispose: () => runner.dispose() }
}

function runContext (input: InputRecipe, deps: RecipeRunDependencies, gate: RunGate): RunContext {
  const solvers = deps.captchaSolvers ?? new CaptchaSolverRegistry()
  for (const name of captchaSolverNames(input)) solvers.resolve(name)

  return { gate, solvers, budget: new CaptchaBudget(input.session?.captcha?.maxSolves ?? DEFAULT_MAX_SOLVES) }
}

function openRotating (input: InputRecipe, deps: RecipeRunDependencies, context: RunContext): Promise<RotatingRunner> {
  const onBlock = input.session?.onBlock

  return RotatingRunner.open({
    recipe:       input,
    events:       deps.events,
    maxRotations: onBlock?.rotate === true ? (onBlock.attempts ?? 2) : 0,
    open:         attempt => openLeased(input, deps, context, attempt),
  })
}

/**
 * Runs one input recipe end to end: session, runner, the step walk, and for
 * every emitted scope the mapping, de-duplication and the sink. A step or
 * mapping failure under the `fail` policy ends the recipe and is reported,
 * never thrown: the caller decides whether the run goes on.
 *
 * @param recipe - The input recipe.
 * @param output - The output recipe it feeds.
 * @param deps - Shared browser, hooks, events, sink and de-duplication.
 * @param variant - The vars a matrix set for this run, reported with it.
 * @returns What happened.
 */
export async function runInputRecipe (recipe: InputRecipe, output: OutputRecipe, deps: RecipeRunDependencies, variant?: Record<string, VarValue>): Promise<RecipeReport> {
  const { report } = await runRecipe(recipe, output, deps, { variant })

  return report
}

/**
 * Runs a recipe once, on its own runner or on an open window. On a window the
 * runner stays open afterwards, and the captcha budget starts again.
 *
 * Emits are serialised through one promise chain whatever the concurrency, so
 * the sink sees one record at a time and `maxRecords` is exact: once reached,
 * every later emit returns `stop` before mapping. With `hold`, mapped records
 * wait in memory; de-duplication, `resume` and the sink see them only once the
 * whole run succeeded, so a failed run (a work item to retry) writes nothing
 * and leaves no key behind.
 *
 * @param recipe - The input recipe (with the item's vars, in worker mode).
 * @param output - The output recipe it feeds.
 * @param deps - Shared browser, hooks, events (the window's, in worker mode), sink and de-duplication.
 * @param options - The variant, the window, the item, whether to hold records.
 * @returns The report, and the records written when they were held.
 */
export async function runRecipe (recipe: InputRecipe, output: OutputRecipe, deps: RecipeRunDependencies, options: RecipeRunOptions = {}): Promise<RecipeRunResult> {
  const { variant, window, item } = options
  const input = window === undefined ? prepared(recipe, deps) : { ...window.recipe, vars: recipe.vars }
  const started = Date.now()
  const sampleStarted = started
  const report: RecipeReport = { recipeId: input.id, ...(variant !== undefined && { variant }), ...(item !== undefined && { item }), mode: input.mode, emitted: 0, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 0, pages: 0, durationMs: 0 }
  const captchas = { detected: 0, solved: 0, failed: 0 }
  const limits = input.limits ?? {}
  const held: { record: OutputRecord, url: string, snapshot: Record<string, unknown>, trace?: MappingTrace }[] = []
  const written: OutputRecord[] = []
  let stopped = false
  let chain: Promise<unknown> = Promise.resolve()
  const unsubscribe = deps.events.subscribe((event) => {
    if (event.recipeId !== input.id) return
    switch (event.type) {
      case 'page:visit': {
        report.pages += 1
        checkSample()
        break
      }
      case 'step:skip': {
        report.stepsSkipped += 1
        break
      }
      case 'captcha:detected': {
        captchas.detected += 1
        break
      }
      case 'captcha:solved': {
        captchas.solved += 1
        break
      }
      case 'captcha:failed': { {
        captchas.failed += 1
        // No default
      }
      break
      }
    }
  })
  deps.events.emit({ type: 'recipe:start', recipeId: input.id, mode: input.mode, ...(variant !== undefined && { variant }) })
  const dedupe = deps.dedupe.forRecipe()
  let runner: StepRunner | undefined
  try {
    // Parallel iterations: requests in api mode, tabs of the recipe's context in web mode.
    const gate = window?.gate ?? new RunGate(limits.concurrency ?? 1, limits.delayMs ?? 0, deps.hosts)
    window?.budget.reset()
    runner = window?.runner ?? await openRotating(input, deps, runContext(input, deps, gate))
    for (const point of input.start) {
      const scope = new ExtractionScope()
      scope.set('vars', { ...input.vars, ...point.vars })
      scope.set('start', { url: point.url })
      scope.setPage({ url: point.url, number: 1 })
      const outcome = await runSteps(input.steps, scope, {
        recipe: input,
        runner,
        hooks:  deps.hooks,
        events: deps.events,
        gate,
        memory: window?.memory,
        onEmit: (emitScope, outputId) => emit(emitScope, outputId, point.url),
      })
      if (outcome === 'stop') break
    }
    // Every emit's failure has reached the step that emitted it, whose onError decided; the last one
    // must not fail the run a second time here.
    try {
      await chain
    } catch {
      // already handled by the emitting step
    }
    for (const entry of held) await write(entry.record, entry.url, entry.snapshot, entry.trace)
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
    report.errorKind = errorKindOf(error)
    deps.events.emit({ type: 'error', recipeId: input.id, message: report.error })
  } finally {
    if (window === undefined) await runner?.dispose()
    unsubscribe()
    if (captchas.detected > 0) report.captchas = captchas
    report.durationMs = Date.now() - started
    deps.events.emit({ type: 'recipe:finish', recipeId: input.id, ...(variant !== undefined && { variant }), emitted: report.emitted, rejected: report.rejected, duplicates: report.duplicates, skipped: report.skipped, stepsSkipped: report.stepsSkipped, pages: report.pages, durationMs: report.durationMs, error: report.error })
  }

  return { report, records: written }

  function emit (scope: ExtractionScope, outputId: string | undefined, startUrl: string): Promise<EmitOutcome> {
    if (outputId !== undefined && outputId !== output.id) throw new Error(`emit names output "${outputId}" but this run produces "${output.id}"`)
    const snapshot = scope.snapshot()
    const url = scope.pageState?.url ?? startUrl
    const previous = chain
    const turn = (async (): Promise<EmitOutcome> => {
      try {
        await previous
      } catch {
        // the failed emit already reached its own caller
      }

      return emitOne(snapshot, url)
    })()
    chain = turn

    return turn
  }

  async function emitOne (snapshot: Record<string, unknown>, url: string): Promise<EmitOutcome> {
    if (stopped) return 'stop'
    try {
      const trace: MappingTrace | undefined = deps.debug === true ? {} : undefined
      const record = await mapRecord({ snapshot, input, output, hooks: deps.hooks, url, trace, log: (level, message, meta) => { deps.events.emit({ type: level === 'error' ? 'error' : 'warning', recipeId: input.id, message: `[${level}] ${message}`, meta }) } })
      if (item !== undefined) record.source.item = item
      if (options.hold === true) held.push({ record, url, snapshot, trace })
      else await write(record, url, snapshot, trace)
    } catch (error) {
      if (!(error instanceof RecordRejectedError)) throw error
      report.rejected += 1
      deps.events.emit({ type: 'record:reject', recipeId: input.id, url, field: error.field, reason: error.reason, scope: deps.debug === true ? snapshot : undefined })
    }
    if (limits.maxRecords !== undefined && report.emitted + held.length >= limits.maxRecords) stopped = true
    checkSample()

    return stopped ? 'stop' : 'continue'
  }

  /**
   * Checked after each record emit and each page visit: the natural points
   * where stopping is clean (no request left half-sent). Sets `stopped` and
   * the report's `stoppedBy` the first time a budget in `deps.sample` is hit;
   * a budget already exceeded (`stopped` already true) is left alone, so the
   * first one hit is the one reported.
   */
  function checkSample (): void {
    if (stopped || deps.sample === undefined) return
    const { maxRecords, maxPages, maxMs } = deps.sample
    if (maxRecords !== undefined && report.emitted + held.length >= maxRecords) {
      stopped = true
      report.stoppedBy = 'sample-maxRecords'
      // > , not >=: lets every record already found on the page in progress emit, and stops before the next one.
    } else if (maxPages !== undefined && report.pages > maxPages) {
      stopped = true
      report.stoppedBy = 'sample-maxPages'
    } else if (maxMs !== undefined && Date.now() - sampleStarted >= maxMs) {
      stopped = true
      report.stoppedBy = 'sample-maxMs'
    }
  }

  async function write (record: OutputRecord, url: string, snapshot: Record<string, unknown>, trace?: MappingTrace): Promise<void> {
    if (deps.resume === true && record.key !== null && await deps.sink.has?.(record.key) === true) {
      report.skipped += 1
      deps.events.emit({ type: 'record:skipped', recipeId: input.id, url, key: record.key })
    } else if (dedupe.isDuplicate(record)) {
      report.duplicates += 1
      deps.events.emit({ type: 'record:duplicate', recipeId: input.id, url, key: record.key ?? '' })
    } else {
      await deps.sink.write(record)
      report.emitted += 1
      if (options.hold === true) written.push(record)
      deps.events.emit({ type: 'record:emit', recipeId: input.id, url, key: record.key, data: record.data, scope: deps.debug === true ? snapshot : undefined, mapping: trace })
    }
  }
}

/**
 * The recipe run's access lease, announced as an event. A recipe that asks for
 * a country while no profile applies gets a warning rather than silence.
 */
async function leaseAccess (input: InputRecipe, deps: RecipeRunDependencies, attempt: number): Promise<AccessLease> {
  const wanted = input.session?.access
  const lease = await deps.access.lease({ recipeId: input.id, profile: wanted?.profile, country: wanted?.country, sticky: wanted?.sticky, attempt })
  const server = lease.proxy?.server ?? (lease.cdp === undefined ? undefined : redactEndpoint(lease.cdp.endpoint))
  deps.events.emit({ type: 'access:lease', recipeId: input.id, profile: lease.profile, kind: lease.kind, server, session: lease.session })
  if (attempt === 1 && lease.kind === 'direct' && wanted?.country !== undefined) {
    deps.events.emit({ type: 'warning', recipeId: input.id, message: `session.access.country "${wanted.country}" is ignored: no proxy profile applies to this recipe` })
  }

  return lease
}

/** A lease and a runner opened on it; the lease is released again when opening fails. */
async function openLeased (input: InputRecipe, deps: RecipeRunDependencies, context: RunContext, attempt: number): Promise<LeasedRunner> {
  const lease = await leaseAccess(input, deps, attempt)
  try {
    return { runner: await openRunner(input, deps, context, lease), lease }
  } catch (error) {
    await lease.release?.()
    throw error
  }
}

async function openRunner (input: InputRecipe, deps: RecipeRunDependencies, context: RunContext, lease: AccessLease): Promise<StepRunner> {
  const { gate } = context
  const captcha = new CaptchaGuard({ recipe: input, events: deps.events, solvers: context.solvers, budget: context.budget, lease })
  if (lease.cdp !== undefined) return openRemoteRunner(input, deps, context, lease, lease.cdp)
  if (input.mode === 'web' && input.session?.browserProfile !== undefined) return openProfileRunner(input, deps, context, lease, captcha)
  const storageState = await resolveStorageState(input, deps, lease, captcha, context)
  const session = input.session
  const access = accessOptions(lease, session?.headers, deps.allowedHosts)
  if (input.mode === 'web') {
    const browser = await deps.browser()
    const browserSession = await browser.newSession({ storageState, cookies: session?.cookies, userAgent: session?.userAgent, viewport: session?.viewport, ...access })

    return new WebStepRunner(browserSession, input, deps.events, gate, captcha)
  }
  const client = await HttpClient.open({
    storageState,
    headers:           access.headers,
    userAgent:         session?.userAgent,
    timeoutMs:         input.limits?.timeoutMs,
    ignoreHTTPSErrors: deps.ignoreHTTPSErrors === true || access.ignoreHTTPSErrors === true,
    proxy:             access.proxy,
    allowedHosts:      access.allowedHosts,
  })

  return new ApiStepRunner(client, input, deps.events, gate)
}

/**
 * A web runner in a persistent browser profile. The bootstrap runs in the
 * same browser as the crawl, and what both leave behind (cookies, storage)
 * stays in the profile for the next run.
 */
async function openProfileRunner (input: InputRecipe, deps: RecipeRunDependencies, context: RunContext, lease: AccessLease, captcha: CaptchaGuard): Promise<StepRunner> {
  const saved = await readSavedState(input, deps)
  const browserSession = await openBrowserProfile(saved === undefined ? input : { ...input, session: { ...input.session, cookies: [...saved.cookies, ...(input.session?.cookies ?? [])] } }, deps, lease, context)
  try {
    if (saved === undefined && input.session?.bootstrap !== undefined) await runBootstrap(input, browserSession, deps, captcha)
  } catch (error) {
    await browserSession.close()
    throw error
  }

  return new WebStepRunner(browserSession, input, deps.events, context.gate, captcha)
}

/**
 * A web runner in a remote browser. The bootstrap runs in the same remote
 * session as the crawl: providers tie the IP and fingerprint to the
 * connection, so a login in one connection would not carry to another.
 */
async function openRemoteRunner (input: InputRecipe, deps: RecipeRunDependencies, context: RunContext, lease: AccessLease, cdp: NonNullable<AccessLease['cdp']>): Promise<StepRunner> {
  const captcha = new CaptchaGuard({ recipe: input, events: deps.events, solvers: context.solvers, budget: context.budget, lease })
  if (input.mode === 'api') throw new AccessConfigError(`recipe "${input.id}" runs in api mode, but access profile "${lease.profile}" is a remote browser; api recipes need a proxy profile`)
  if (input.session?.browserProfile !== undefined) throw new AccessConfigError(`recipe "${input.id}" uses browser profile "${input.session.browserProfile}", which needs a local browser, but access profile "${lease.profile}" is a remote browser`)
  const session = input.session
  const storageState = await readSavedState(input, deps)
  const browserSession = await BrowserClient.connectOverCDP(cdp, { storageState, cookies: session?.cookies, viewport: session?.viewport, ...accessOptions(lease, session?.headers, deps.allowedHosts) }, input.limits?.timeoutMs)
  try {
    if (storageState === undefined && session?.bootstrap !== undefined) await runBootstrap(input, browserSession, deps, captcha)
  } catch (error) {
    await browserSession.close()
    throw error
  }

  return new WebStepRunner(browserSession, input, deps.events, context.gate, captcha)
}
