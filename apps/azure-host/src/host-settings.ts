import type { HttpRequest } from '@azure/functions'
import { blobRecipes, blobResults, memoryRecipes } from '@opencraw/azure-durable'
import type { OpenCrawHostOptions } from '@opencraw/azure-durable'
import { tesseractReader } from '@opencraw/captcha-tesseract'
import { accessConfigSchema } from '@opencraw/core'
import type { AccessConfig } from '@opencraw/core'
import { bookHooks } from './book-hooks.js'
import type { ShippedRecipes } from './shipped-recipes.js'

/** App settings reach the process as environment variables. */
export type AppSettings = Record<string, string | undefined>

const list = (value: string | undefined): string[] => (value ?? '').split(',').map(entry => entry.trim()).filter(entry => entry !== '')
const count = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * A storage connection string the Blob stores can use: one with an account
 * key (it signs the result links), or the local emulator. An identity-based
 * `AzureWebJobsStorage` (no key) cannot sign links, so the host keeps
 * published recipes in memory and returns every result inline.
 */
function keyedStorage (settings: AppSettings): string | undefined {
  const connection = settings.OPENCRAW_STORAGE ?? settings.AzureWebJobsStorage
  if (connection === undefined) return undefined

  return /AccountKey=|UseDevelopmentStorage=true/i.test(connection) ? connection : undefined
}

/**
 * The access config in `OPENCRAW_ACCESS`, checked as core checks an access file.
 *
 * @param json - The setting.
 * @returns The config.
 * @throws Error naming what is wrong with it.
 */
function accessConfig (json: string): AccessConfig {
  const parsed = accessConfigSchema.safeParse(JSON.parse(json))
  if (!parsed.success) throw new Error(`OPENCRAW_ACCESS: ${parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`)

  return parsed.data
}

/**
 * The host's options, from app settings:
 *
 * | Setting | Default | What it does |
 * |---|---|---|
 * | `OPENCRAW_ALLOWED_HOSTS` | `books.toscrape.com` | The only hosts recipes may reach, comma-separated. |
 * | `OPENCRAW_MCP` | `true` | The recipe-authoring MCP endpoint, `/api/mcp`. |
 * | `OPENCRAW_PROMOTERS` | none | Who may promote a draft (their Entra ID principal names), comma-separated. |
 * | `OPENCRAW_MAX_WINDOWS` | `4` | The most browser windows one pool may run. |
 * | `OPENCRAW_POOL_IDLE_MINUTES` | `10` | A pool with no item this long closes. |
 * | `OPENCRAW_STORAGE` | `AzureWebJobsStorage` | Where published recipes and large results go (needs an account key). |
 * | `OPENCRAW_ACCESS` | direct | An access config as JSON: proxy profiles, the default one, per-site throttle. Credentials as `{{env.NAME}}`, read from other app settings. |
 * | `WEBSITE_AUTH_ENABLED` | set by App Service | When `True`, callers are told apart by their Entra ID principal. |
 *
 * @param settings - The environment.
 * @param shipped - The recipe sets the deployment ships with.
 * @returns The options for `registerOpenCraw`.
 */
export function hostOptions (settings: AppSettings, shipped: ShippedRecipes[]): OpenCrawHostOptions {
  const storage = keyedStorage(settings)
  const promoters = new Set(list(settings.OPENCRAW_PROMOTERS).map(name => name.toLowerCase()))
  const allowedHosts = list(settings.OPENCRAW_ALLOWED_HOSTS)
  const maxWindows = count(settings.OPENCRAW_MAX_WINDOWS, 4)
  // App Service authentication sets this header and strips any a client sends; without it, anyone could send it.
  const easyAuth = settings.WEBSITE_AUTH_ENABLED?.toLowerCase() === 'true'

  return {
    allowedHosts:   allowedHosts.length === 0 ? ['books.toscrape.com'] : allowedHosts,
    ...(easyAuth && { identify: (request: HttpRequest) => request.headers.get('x-ms-client-principal-name') ?? undefined }),
    canPromote:     caller => caller !== undefined && promoters.has(caller.toLowerCase()),
    recipes:        storage === undefined ? memoryRecipes(shipped) : blobRecipes({ connectionString: storage, shipped }),
    ...(storage !== undefined && { results: blobResults({ connectionString: storage }) }),
    ...(settings.OPENCRAW_ACCESS !== undefined && settings.OPENCRAW_ACCESS.trim() !== '' && { access: accessConfig(settings.OPENCRAW_ACCESS) }),
    hooks:          bookHooks,
    // A fresh reader per crawler: a crawler closes its solvers when it closes.
    captchaSolvers: () => [tesseractReader()],
    browser:        { headless: true },
    mcp:            settings.OPENCRAW_MCP?.toLowerCase() !== 'false',
    pools:          {
      maxWindows,
      idleTtlMs: count(settings.OPENCRAW_POOL_IDLE_MINUTES, 10) * 60_000,
      windows:   { min: 1, max: maxWindows, grow: { after: 3 }, idle: { afterMs: 60_000 } },
    },
  }
}
