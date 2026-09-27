import { setTimeout as delay } from 'node:timers/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { startOrchestration } from '@mnci/az-durable'
import type { TypedOrchestration } from '@mnci/az-durable'
import { probeUrl } from '@opencraw/cli'
import { createCrawler, loadRecipes, memorySink } from '@opencraw/core'
import { validateTool } from '@opencraw/mcp'
import type { DurableClient } from 'durable-functions'
import type { CallerAccess } from '../caller-access'
import type { CrawlJob, CrawlResult } from '../crawl-run'
import { crawlOptionsFor } from '../host-options'
import type { HostSettings } from '../host-options'
import { findRecipes, RecipeStoreError } from '../recipe-store'

/** What every authoring tool call works with: the host, the caller, and Durable for full runs. */
export interface AuthoringContext {
  settings: HostSettings & { mcp: NonNullable<HostSettings['mcp']> }
  access:   CallerAccess
  client:   DurableClient
  crawl:    TypedOrchestration<CrawlJob, CrawlResult>
}

/** Names and versions end up in blob names: letters, digits, `_`, `.`, `-`. */
const NAME = /^[\w.-]{1,64}$/

const text = (value: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> })
const failed = (error: unknown): CallToolResult => ({ content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true })

/**
 * `probe`: where a page's data lives, fetched from the host itself (its IP,
 * its proxies) and only from the caller's hosts.
 *
 * @param context - The call's context.
 * @param args - The page, whether to render it, an access profile.
 * @returns The findings.
 */
export async function probe (context: AuthoringContext, args: { url: string, browser?: boolean, access?: string }): Promise<CallToolResult> {
  const { settings } = context
  try {
    return text(await probeUrl(args.url, {
      browser:       args.browser ?? false,
      insecureTls:   settings.browser?.ignoreHTTPSErrors === true,
      browserPath:   settings.browser?.executablePath,
      allowedHosts:  [...context.access.allowedHosts],
      accessConfig:  settings.access ?? { profiles: {} },
      accessPlugins: settings.accessPlugins,
      ...(args.access !== undefined && { accessProfile: args.access }),
    }))
  } catch (error) {
    return failed(error)
  }
}

/**
 * `validate`: `@opencraw/mcp`'s own, on inline recipes only (never paths on the host).
 *
 * @param args - The recipes.
 * @returns Every issue with its JSON path.
 */
export async function validate (args: { recipes: string | Record<string, unknown>[] }): Promise<CallToolResult> {
  return await validateTool({ recipes: args.recipes })
}

/**
 * `run`: a sample by default (a few records per input recipe, within the
 * time a tool call may take), or with `full` a Durable crawl whose instance
 * id `status` reads. Drafts run here; production routes refuse them.
 *
 * @param context - The call's context.
 * @param args - Inline recipes or a stored set, and whether to run it all.
 * @returns The sample's reports and records, or the instance id.
 */
export async function run (context: AuthoringContext, args: { recipes?: Record<string, unknown>[], recipe?: { name: string, version: string }, full?: boolean }): Promise<CallToolResult> {
  const { settings, access } = context
  let recipes: unknown[]
  try {
    recipes = await recipesOf(context, args)
    await loadRecipes(recipes)
  } catch (error) {
    return failed(error)
  }
  const output = recipes.find(recipe => kindOf(recipe) === 'output')
  const inputs = recipes.filter(recipe => recipe !== output)
  if (args.full === true) {
    const job: CrawlJob = { ...(access.caller !== undefined && { caller: access.caller }), allowedHosts: [...access.allowedHosts], output, inputs }
    const instanceId = await startOrchestration(context.client, context.crawl, job)

    return text({ instanceId, next: 'call status with this instance id until runtimeStatus is Completed' })
  }
  const sample = inputs.map(input => withMaxRecords(input, settings.mcp.sampleRecords))
  const sink = memorySink()
  const crawler = createCrawler({ ...crawlOptionsFor(settings, access.allowedHosts), sink })
  const stop = new AbortController()
  try {
    const set = await loadRecipes([output, ...sample])
    const finished = await Promise.race([crawler.run(set), delay(settings.mcp.sampleMs, undefined, { signal: stop.signal })])
    const timedOut = finished === undefined

    return text({
      recipes: (finished)?.recipes ?? [],
      records: sink.records,
      ...(timedOut && { stopped: `after ${settings.mcp.sampleMs} ms; these are the records found by then` }),
    })
  } catch (error) {
    return failed(error)
  } finally {
    stop.abort()
    await crawler.close()
  }
}

/**
 * `status`: a full run's state and result, for the caller who started it.
 *
 * @param context - The call's context.
 * @param args - The instance id `run` returned.
 * @returns Its runtime status, progress and output.
 */
export async function status (context: AuthoringContext, args: { instanceId: string }): Promise<CallToolResult> {
  try {
    const found = await context.client.getStatus(args.instanceId, { showInput: true })
    const job = found.input as Partial<CrawlJob> | undefined
    if (job?.caller !== context.access.caller) return failed(`no crawl "${args.instanceId}" of yours`)

    return text({ runtimeStatus: found.runtimeStatus, progress: found.customStatus, output: found.output })
  } catch {
    return failed(`no crawl "${args.instanceId}" of yours`)
  }
}

/**
 * `list_recipes`: the stored recipe sets, with their versions and states.
 *
 * @param context - The call's context.
 * @returns The list.
 */
export async function listRecipes (context: AuthoringContext): Promise<CallToolResult> {
  return text({ recipes: await context.settings.recipes?.list() ?? [] })
}

/**
 * `get_recipes`: a stored set's recipes, drafts included: the start of a new version.
 *
 * @param context - The call's context.
 * @param args - The name and version.
 * @returns The set.
 */
export async function getRecipes (context: AuthoringContext, args: { name: string, version: string }): Promise<CallToolResult> {
  try {
    return text(await findRecipes(context.settings.recipes, args.name, args.version, true))
  } catch (error) {
    return failed(error)
  }
}

/**
 * `publish`: saves recipes that load as a new version, as a draft. A person
 * (or a caller allowed to) promotes it before production runs it.
 *
 * @param context - The call's context.
 * @param args - The name, a new version, the recipes.
 * @returns The stored version.
 */
export async function publish (context: AuthoringContext, args: { name: string, version: string, recipes: Record<string, unknown>[] }): Promise<CallToolResult> {
  const store = context.settings.recipes
  if (store === undefined) return failed('this host has no recipe store to publish to')
  if (!NAME.test(args.name) || !NAME.test(args.version)) return failed('name and version: 1 to 64 letters, digits, "_", "." or "-"')
  try {
    await loadRecipes(args.recipes)
    await store.put({ name: args.name, version: args.version, recipes: args.recipes })
  } catch (error) {
    return failed(error)
  }

  return text({ name: args.name, version: args.version, state: 'draft', next: 'a person promotes it: POST /recipes/{name}/{version}/promote' })
}

async function recipesOf (context: AuthoringContext, args: { recipes?: Record<string, unknown>[], recipe?: { name: string, version: string } }): Promise<unknown[]> {
  if ((args.recipes === undefined) === (args.recipe === undefined)) throw new RecipeStoreError('give exactly one of "recipes" or "recipe"', 404)
  if (args.recipes !== undefined) return args.recipes
  const stored = await findRecipes(context.settings.recipes, args.recipe?.name ?? '', args.recipe?.version ?? '', true)

  return stored.recipes
}

/** An input recipe that stops after `limit` records, or sooner if it already did. */
function withMaxRecords (input: unknown, limit: number): unknown {
  if (typeof input !== 'object' || input === null) return input
  const limits = (input as { limits?: { maxRecords?: number } }).limits

  return { ...input, limits: { ...limits, maxRecords: Math.min(limits?.maxRecords ?? limit, limit) } }
}

function kindOf (recipe: unknown): unknown {
  return typeof recipe === 'object' && recipe !== null && 'kind' in recipe ? recipe.kind : undefined
}
