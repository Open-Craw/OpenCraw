import type { HttpRequest } from '@azure/functions'
import type { AccessConfig, AccessPlugin, BrowserSessionConfig, CaptchaSolver, CrawlOptions, HookMap, WindowsPolicy } from '@opencraw/core'
import type { RecipeStore } from '../recipe-store'
import type { ResultStore } from '../result-store'

/** How the host is set up: everything that is code or a secret lives here, never in a request. */
export interface OpenCrawHostOptions {
  /**
   * The hosts a caller's recipes may reach (`example.com`, `*.example.com`,
   * `host:port`, `*`). A list applies to every caller; a function decides per
   * caller, and a caller it returns nothing for is refused (403).
   */
  allowedHosts:      readonly string[] | ((caller: string | undefined) => readonly string[] | undefined)
  /**
   * Who is calling, from the request: an Entra ID principal (App Service
   * authentication sets `x-ms-client-principal-name`), a key name, a header
   * your gateway sets. Only trust a header something in front of the app
   * sets and callers cannot. Default: nobody in particular.
   */
  identify?:         (request: HttpRequest) => string | undefined
  /** Named recipes: what `/jobs` items and `/crawl` by name run. */
  recipes?:          RecipeStore
  /** Where results too large to return inline go. Without one, every result is returned inline. */
  results?:          ResultStore
  /** Results larger than this (as JSON) go to `results`. Default 256 KiB. */
  inlineLimitBytes?: number
  hooks?:            HookMap
  /** A fresh set per crawler: a crawler closes its solvers when it closes. */
  captchaSolvers?:   () => CaptchaSolver[]
  access?:           AccessConfig
  accessPlugins?:    AccessPlugin[]
  browser?:          BrowserSessionConfig
  /** Worker pools: one per caller and crawl id. */
  pools?:            PoolSettings
  /**
   * The recipe-authoring MCP endpoint, `/mcp`: `true`, or its sample limits.
   * Off by default. It refuses to start without authentication.
   */
  mcp?:              boolean | McpSettings
  /** Who may promote a draft to production (`POST /recipes/{name}/{version}/promote`). Default: nobody. */
  canPromote?:       (caller: string | undefined) => boolean
  /** Default `function`: a function key is needed. `anonymous` only behind something that authenticates. */
  authLevel?:        'anonymous' | 'function' | 'admin'
  /** Prepended to every route: `'opencraw'` gives `/api/opencraw/crawl`. Default none. */
  routePrefix?:      string
  /**
   * Lets a hook that answers `pending` post its result back (`POST /callouts/{token}/resolve`) instead of
   * being asked again. Off by default: a pending hook is then polled inside the activity.
   */
  callouts?:         CalloutSettings
}

export interface CalloutSettings {
  /** The name of the environment variable holding the key that signs resume tokens. A secret: never in code or a recipe. */
  signingKeyEnv: string
  /** The base URL handlers post to (`https://app.example.com/api`), when the request URL is not it (a proxy, a custom domain). Default: derived from the request that started the job. */
  publicUrl?:    string
  /** How long a job waits for a posted-back result before the recipe fails. Default 1 hour. */
  waitMs?:       number
}

export interface McpSettings {
  /** A sample run (`run` without `full`) stops after this many records per input recipe. Default 20. */
  sampleRecords?: number
  /** And after this long, whatever it has by then. Default 60 seconds: MCP clients time out tool calls. */
  sampleMs?:      number
}

export interface PoolSettings {
  /** A pool with no item for this long closes. Default 10 minutes. */
  idleTtlMs?:  number
  /** The windows policy a job gets when its request names none. Default `{ min: 1, max: 4, grow: { after: 5 }, idle: { afterMs: 60000 } }`. */
  windows?:    WindowsPolicy
  /** No pool gets more windows than this, whatever a job asks. Default 8. */
  maxWindows?: number
}

/** The options with their defaults. */
export interface HostSettings extends Omit<OpenCrawHostOptions, 'pools' | 'inlineLimitBytes' | 'routePrefix' | 'authLevel' | 'mcp' | 'canPromote' | 'callouts'> {
  inlineLimitBytes: number
  routePrefix:      string
  authLevel:        'anonymous' | 'function' | 'admin'
  pools:            Required<PoolSettings>
  /** `undefined` when the endpoint is off. */
  mcp?:             Required<McpSettings>
  canPromote:       (caller: string | undefined) => boolean
  /** `undefined` when posted-back results are off. */
  callouts?:        Required<Pick<CalloutSettings, 'signingKeyEnv' | 'waitMs'>> & Pick<CalloutSettings, 'publicUrl'>
}

const KIB = 1024
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * @param options - As given.
 * @returns The options with their defaults.
 * @throws Error when `allowedHosts` is an empty list (a host that may reach nothing runs nothing), or the MCP endpoint would be open to anyone.
 */
export function resolveHostOptions (options: OpenCrawHostOptions): HostSettings {
  if (Array.isArray(options.allowedHosts) && options.allowedHosts.length === 0) throw new Error('allowedHosts is empty: list the hosts recipes may reach, or "*" for any')
  const authLevel = options.authLevel ?? 'function'
  const mcp = options.mcp === undefined || options.mcp === false ? undefined : { sampleRecords: 20, sampleMs: MINUTE_MS, ...(options.mcp !== true && options.mcp) }
  if (mcp !== undefined && authLevel === 'anonymous' && options.identify === undefined) throw new Error('the MCP endpoint needs authentication: keep authLevel "function", or put the app behind App Service authentication and set identify')
  const callouts = options.callouts === undefined ? undefined : calloutSettings(options.callouts)
  const { mcp: _mcp, canPromote, callouts: _callouts, ...rest } = options

  return {
    ...rest,
    ...(mcp !== undefined && { mcp }),
    ...(callouts !== undefined && { callouts }),
    canPromote:       canPromote ?? ((): boolean => false),
    inlineLimitBytes: options.inlineLimitBytes ?? 256 * KIB,
    routePrefix:      (options.routePrefix ?? '').replaceAll(/^\/+|\/+$/g, ''),
    authLevel,
    pools:            {
      idleTtlMs:  options.pools?.idleTtlMs ?? 10 * MINUTE_MS,
      windows:    options.pools?.windows ?? { min: 1, max: 4, grow: { after: 5 }, idle: { afterMs: MINUTE_MS } },
      maxWindows: options.pools?.maxWindows ?? 8,
    },
  }
}

function calloutSettings (options: CalloutSettings): NonNullable<HostSettings['callouts']> {
  const key = process.env[options.signingKeyEnv]
  if (key === undefined || key === '') throw new Error(`callouts.signingKeyEnv names ${options.signingKeyEnv}, which is not set: it must hold the key that signs resume tokens`)

  return { signingKeyEnv: options.signingKeyEnv, waitMs: options.waitMs ?? HOUR_MS, ...(options.publicUrl !== undefined && { publicUrl: options.publicUrl }) }
}

/**
 * What a crawler for one caller is created with: the host's code and
 * secrets, and the caller's hosts.
 *
 * @param settings - The host settings.
 * @param allowedHosts - The caller's hosts.
 * @returns Crawl options, without a sink.
 */
export function crawlOptionsFor (settings: HostSettings, allowedHosts: readonly string[]): CrawlOptions {
  return {
    allowedHosts:   [...allowedHosts],
    hooks:          settings.hooks,
    captchaSolvers: settings.captchaSolvers?.(),
    access:         settings.access,
    accessPlugins:  settings.accessPlugins,
    browser:        settings.browser,
  }
}
