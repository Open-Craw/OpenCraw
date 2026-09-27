import type { HttpRequest, HttpResponse, HttpResponseInit } from '@azure/functions'
import { startOrchestration } from '@mnci/az-durable'
import type { TypedOrchestration } from '@mnci/az-durable'
import { loadRecipes } from '@opencraw/core'
import type { DurableClient } from 'durable-functions'
import { callerAccess } from '../caller-access'
import type { HostSettings } from '../host-options'
import { problem, readJson } from '../http-reply'
import { findRecipes, RecipeStoreError } from '../recipe-store'
import { crawlRequestSchema } from './crawl-request.validator'
import type { CrawlJob, CrawlResult } from './crawl-job.model'

/**
 * `POST /crawl`: checks the caller and the recipes, then starts the
 * orchestration. Recipes that do not load are a 400 before anything is
 * queued.
 *
 * @param request - The request.
 * @param client - The Durable client.
 * @param settings - The host settings.
 * @param orchestration - The `/crawl` orchestration.
 * @returns 202 with the Durable status URLs, or the problem.
 */
export async function startCrawl (request: HttpRequest, client: DurableClient, settings: HostSettings, orchestration: TypedOrchestration<CrawlJob, CrawlResult>): Promise<HttpResponse | HttpResponseInit> {
  const access = callerAccess(request, settings)
  if (access === undefined) return problem(403, 'this caller may not run recipes here')
  const parsed = crawlRequestSchema.safeParse(await readJson(request))
  if (!parsed.success) return problem(400, `the body must be { output, inputs, options? } or { recipe: { name, version }, options? }: ${parsed.error.message}`)
  let recipes: unknown[]
  try {
    if ('recipe' in parsed.data) {
      const stored = await findRecipes(settings.recipes, parsed.data.recipe.name, parsed.data.recipe.version)
      recipes = stored.recipes
    } else {
      recipes = [parsed.data.output, ...parsed.data.inputs]
    }
    await loadRecipes(recipes)
  } catch (error) {
    return problem(error instanceof RecipeStoreError ? error.status : 400, error)
  }
  const output = recipes.find(recipe => kindOf(recipe) === 'output')
  const job: CrawlJob = {
    ...(access.caller !== undefined && { caller: access.caller }),
    allowedHosts: [...access.allowedHosts],
    output,
    inputs:       recipes.filter(recipe => recipe !== output),
    ...(parsed.data.options?.dedupe !== undefined && { dedupe: parsed.data.options.dedupe }),
  }
  const instanceId = await startOrchestration(client, orchestration, job)

  return client.createCheckStatusResponse(request, instanceId)
}

function kindOf (recipe: unknown): unknown {
  return typeof recipe === 'object' && recipe !== null && 'kind' in recipe ? recipe.kind : undefined
}
