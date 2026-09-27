import { chromium, firefox, webkit } from 'playwright'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright'
import type { HostAllowlist } from '../host-allowlist'
import { DEFAULT_BROWSER_CONFIG } from './browser-session.config'
import type { BrowserSessionConfig } from './browser-session.config'

/** Playwright's storage state: cookies plus per-origin local storage. */
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

/** What a session starts from. */
export interface SessionOptions {
  storageState?:      StorageState
  cookies?:           Parameters<BrowserContext['addCookies']>[0]
  headers?:           Record<string, string>
  userAgent?:         string
  viewport?:          { width: number, height: number }
  /** A proxy for this context only; overrides the launch-level `proxy`. */
  proxy?:             { server: string, username?: string, password?: string, bypass?: string }
  /** Also accept invalid certificates in this context (a proxy that intercepts HTTPS). */
  ignoreHTTPSErrors?: boolean
  /** Resource types this context never loads (`image`, `font`, `media`...), to save proxy bandwidth. */
  blockResources?:    readonly string[]
  /** The hosts this context may reach; every other request, web socket and `file:` load is refused. */
  allowedHosts?:      HostAllowlist
}

/** One browser context with one page: the unit a recipe runs in. */
export class BrowserSession {
  /**
   * @param context - The browser context.
   * @param page - Its page.
   * @param closer - How to end the session; closing the context by default. A remote browser disconnects instead.
   * @param allowedHosts - The hosts it may reach, when limited: requests made on its behalf outside the page check them too.
   */
  constructor (readonly context: BrowserContext, readonly page: Page, private readonly closer?: () => Promise<void>, readonly allowedHosts?: HostAllowlist) {}

  /** The cookies and storage this session holds now, in the shape an HTTP client or a later run can reuse. */
  storageState (): Promise<StorageState> {
    return this.context.storageState()
  }

  async close (): Promise<void> {
    await (this.closer === undefined ? this.context.close() : this.closer())
  }
}

/**
 * Guards a context's traffic: requests of skipped resource types are aborted
 * (per-GB proxies bill images and fonts like everything else; a crawl rarely
 * needs them), and so is anything outside the allowed hosts, web sockets
 * included.
 *
 * @param context - The browser context.
 * @param types - Playwright resource types to skip.
 * @param allowedHosts - The hosts it may reach, when limited.
 */
async function guardTraffic (context: BrowserContext, types: ReadonlySet<string>, allowedHosts: HostAllowlist | undefined): Promise<void> {
  if (allowedHosts === undefined && types.size === 0) return
  await context.route('**/*', async (route) => {
    const request = route.request()
    if (allowedHosts !== undefined && !allowedHosts.allows(request.url())) {
      await route.abort('blockedbyclient')

      return
    }
    if (types.has(request.resourceType())) {
      await route.abort()

      return
    }
    await route.continue()
  })
  if (allowedHosts === undefined) return
  await context.routeWebSocket(() => true, (socket) => {
    if (allowedHosts.allows(socket.url())) socket.connectToServer()
    else void socket.close({ code: 1008, reason: 'host not allowed' })
  })
}

/**
 * What a context gets after it opened: the cookies to add, and the guard on
 * its traffic.
 *
 * @param context - The context.
 * @param options - The session options.
 */
export async function applySessionExtras (context: BrowserContext, options: SessionOptions): Promise<void> {
  if (options.cookies !== undefined && options.cookies.length > 0) await context.addCookies(options.cookies)
  await guardTraffic(context, new Set(options.blockResources), options.allowedHosts)
}

/** A launched browser; sessions are opened from it and closed independently. */
export class BrowserClient {
  static async launch (config: BrowserSessionConfig = {}): Promise<BrowserClient> {
    const type = config.browserType ?? DEFAULT_BROWSER_CONFIG.browserType
    const launcher = type === 'firefox' ? firefox : (type === 'webkit' ? webkit : chromium)
    const browser = await launcher.launch({
      headless:       config.headless ?? DEFAULT_BROWSER_CONFIG.headless,
      slowMo:         config.slowMo,
      executablePath: config.executablePath,
      proxy:          config.proxy,
    })

    return new BrowserClient(browser, config)
  }

  /**
   * A session in a remote browser, over the Chrome DevTools Protocol. The
   * provider's own context is reused when it offers one (several providers
   * pin the proxy and fingerprint to it); cookies, headers, blocked resources,
   * allowed hosts and the viewport are applied to it (its service workers,
   * set up by the provider, cannot be blocked). Closing the session disconnects,
   * which ends it on the provider's side.
   *
   * @param cdp - The endpoint and connection headers.
   * @param options - What the session starts from. `userAgent` cannot change on an existing context and is ignored.
   * @param timeoutMs - For the connection and every action.
   * @returns The session.
   */
  static async connectOverCDP (cdp: { endpoint: string, headers?: Record<string, string> }, options: SessionOptions = {}, timeoutMs?: number): Promise<BrowserSession> {
    const browser = await chromium.connectOverCDP(cdp.endpoint, { headers: cdp.headers, timeout: timeoutMs })
    const context = browser.contexts()[0] ?? await browser.newContext()
    if (timeoutMs !== undefined) context.setDefaultTimeout(timeoutMs)
    const cookies = [...(options.storageState?.cookies ?? []), ...(options.cookies ?? [])]
    if (cookies.length > 0) await context.addCookies(cookies)
    if (options.headers !== undefined) await context.setExtraHTTPHeaders(options.headers)
    await guardTraffic(context, new Set(options.blockResources), options.allowedHosts)
    const page = await context.newPage()
    if (options.viewport !== undefined) await page.setViewportSize(options.viewport)

    return new BrowserSession(context, page, async () => {
      await browser.close()
    }, options.allowedHosts)
  }

  private constructor (private readonly browser: Browser, private readonly config: BrowserSessionConfig) {}

  async newSession (options: SessionOptions = {}): Promise<BrowserSession> {
    const contextOptions: BrowserContextOptions = {
      storageState:      options.storageState,
      extraHTTPHeaders:  options.headers,
      userAgent:         options.userAgent,
      viewport:          options.viewport,
      proxy:             options.proxy,
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors === true || options.ignoreHTTPSErrors === true,
      // A service worker's requests bypass routing, and with them the allowed hosts.
      ...(options.allowedHosts !== undefined && { serviceWorkers: 'block' as const }),
    }
    const context = await this.browser.newContext(contextOptions)
    if (this.config.timeoutMs !== undefined) context.setDefaultTimeout(this.config.timeoutMs)
    await applySessionExtras(context, options)
    const page = await context.newPage()

    return new BrowserSession(context, page, undefined, options.allowedHosts)
  }

  /** Whether the browser is still there: not closed, not crashed. */
  isConnected (): boolean {
    return this.browser.isConnected()
  }

  async close (): Promise<void> {
    await this.browser.close()
  }
}
