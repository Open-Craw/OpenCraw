import { app } from '@azure/functions'
import type { HttpRequest, HttpResponse, HttpResponseInit } from '@azure/functions'
import { defineActivity, defineOrchestration } from '@mnci/az-durable'
import type { TypedOrchestration } from '@mnci/az-durable'
import * as df from 'durable-functions'
import type { DurableClient } from 'durable-functions'
import { crawlOrchestrator, parseCrawlJob, runRecipeTask, startCrawl } from '../crawl-run'
import type { CrawlJob, CrawlResult, RecipeTask, RecipeTaskResult } from '../crawl-run'
import { resolveHostOptions } from '../host-options'
import type { HostSettings, OpenCrawHostOptions } from '../host-options'
import { mcpEndpoint, promoteRecipes } from '../recipe-authoring'
import { itemOrchestrator, jobRequest, parseItemJob, submitItem, WorkerPools } from '../worker-pools'
import type { ItemJob, ItemOutcome } from '../worker-pools'
import { hostJsonWarnings } from './host-json.validator'

/** The functions the host registered, for tests and for an app that wants to call them itself. */
export interface OpenCrawHost {
  settings:       HostSettings
  pools:          WorkerPools
  orchestrations: {
    crawl: TypedOrchestration<CrawlJob, CrawlResult>
    item:  TypedOrchestration<ItemJob, ItemOutcome>
  }
  activities: {
    runRecipe: (task: RecipeTask) => Promise<RecipeTaskResult>
    runItem:   (job: ItemJob) => Promise<ItemOutcome>
  }
  http: {
    startCrawl: (request: HttpRequest, client: DurableClient) => Promise<HttpResponse | HttpResponseInit>
    submitItem: (request: HttpRequest, client: DurableClient) => Promise<HttpResponse | HttpResponseInit>
    job:        (request: HttpRequest) => Promise<HttpResponseInit>
    /** The authoring MCP endpoint; registered only when `mcp` is on. */
    mcp:        (request: HttpRequest, client: DurableClient) => Promise<HttpResponseInit>
    promote:    (request: HttpRequest) => Promise<HttpResponseInit>
  }
  /** Closes every pool; also run when the Function App shuts down. */
  close: () => Promise<void>
}

/**
 * Registers OpenCraw's HTTP API in this Function App (the v4 programming
 * model): `POST /crawl` runs recipes once, `POST /jobs/{crawlId}/items`
 * sends one item to the caller's warm pool, `GET` and `DELETE
 * /jobs/{crawlId}` read and close it, `POST /recipes/{name}/{version}/promote`
 * makes a draft runnable, and with `mcp` on, `/mcp` serves the authoring
 * tools. Call it once, from the app's entry module; nothing is registered by
 * importing the package.
 *
 * @param options - Allowed hosts, callers, recipes, result storage, plugins, pools.
 * @returns The registered pieces.
 * @throws Error when the options cannot work, or when it is called twice (function names are global).
 */
export function registerOpenCraw (options: OpenCrawHostOptions): OpenCrawHost {
  const settings = resolveHostOptions(options)
  const pools = new WorkerPools(settings)
  for (const warning of hostJsonWarnings(settings.pools.maxWindows)) console.warn(`[opencraw] ${warning}`)

  const runRecipe = async (task: RecipeTask): Promise<RecipeTaskResult> => await runRecipeTask(settings, task)
  const runItem = async (job: ItemJob): Promise<ItemOutcome> => await pools.run(job)
  const crawl = defineOrchestration('OpenCrawCrawl', crawlOrchestrator(defineActivity('OpenCrawRunRecipe', runRecipe)), { parse: parseCrawlJob })
  const item = defineOrchestration('OpenCrawItem', itemOrchestrator(defineActivity('OpenCrawRunItem', runItem)), { parse: parseItemJob })

  const http: OpenCrawHost['http'] = {
    startCrawl: async (request, client) => await startCrawl(request, client, settings, crawl),
    submitItem: async (request, client) => await submitItem(request, client, settings, pools, item),
    job:        async request => await jobRequest(request, settings, pools),
    mcp:        async (request, client) => await mcpEndpoint(request, client, settings, crawl),
    promote:    async request => await promoteRecipes(request, settings),
  }
  const route = (path: string): string => (settings.routePrefix === '' ? path : `${settings.routePrefix}/${path}`)
  df.app.client.http('OpenCrawStartCrawl', { route: route('crawl'), methods: ['POST'], authLevel: settings.authLevel, handler: http.startCrawl })
  df.app.client.http('OpenCrawSubmitItem', { route: route('jobs/{crawlId}/items'), methods: ['POST'], authLevel: settings.authLevel, handler: http.submitItem })
  app.http('OpenCrawJob', { route: route('jobs/{crawlId}'), methods: ['GET', 'DELETE'], authLevel: settings.authLevel, handler: http.job })
  app.http('OpenCrawPromote', { route: route('recipes/{name}/{version}/promote'), methods: ['POST'], authLevel: settings.authLevel, handler: http.promote })
  if (settings.mcp !== undefined) df.app.client.http('OpenCrawMcp', { route: route('mcp'), methods: ['GET', 'POST', 'DELETE'], authLevel: settings.authLevel, handler: http.mcp })
  const close = async (): Promise<void> => { await pools.closeAll() }
  app.hook.appTerminate(close)

  return { settings, pools, orchestrations: { crawl, item }, activities: { runRecipe, runItem }, http, close }
}
