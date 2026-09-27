import { createHash } from 'node:crypto'
import type { HttpRequest, HttpResponse, HttpResponseInit } from '@azure/functions'
import { startOrchestration } from '@mnci/az-durable'
import type { TypedOrchestration } from '@mnci/az-durable'
import type { DurableClient } from 'durable-functions'
import { callerAccess, poolKey } from '../caller-access'
import type { HostSettings } from '../host-options'
import { problem, readJson } from '../http-reply'
import { findRecipes, RecipeStoreError } from '../recipe-store'
import { crawlIdSchema, itemRequestSchema } from './item-request.validator'
import type { ItemJob, ItemOutcome } from './pool-job.model'
import type { WorkerPools } from './worker-pools.store'

/** Durable statuses of an instance still in progress: a duplicate of it gets its status, not a second run. */
const IN_PROGRESS = new Set(['Pending', 'Running', 'ContinuedAsNew', 'Suspended'])

/**
 * `POST /jobs/{crawlId}/items`: one item for the caller's warm pool. The
 * Durable instance id is the caller, crawl id and item id, so the same item
 * sent again while it runs returns the running instance's status.
 *
 * @param request - The request.
 * @param client - The Durable client.
 * @param settings - The host settings.
 * @param pools - This process's pools.
 * @param orchestration - The item orchestration.
 * @returns 202 with the Durable status URLs, or the problem.
 */
export async function submitItem (request: HttpRequest, client: DurableClient, settings: HostSettings, pools: WorkerPools, orchestration: TypedOrchestration<ItemJob, ItemOutcome>): Promise<HttpResponse | HttpResponseInit> {
  const access = callerAccess(request, settings)
  if (access === undefined) return problem(403, 'this caller may not run recipes here')
  const crawlId = crawlIdSchema.safeParse(request.params.crawlId)
  if (!crawlId.success) return problem(400, `crawl id: ${crawlId.error.issues[0]?.message ?? 'invalid'}`)
  const parsed = itemRequestSchema.safeParse(await readJson(request))
  if (!parsed.success) return problem(400, `the body must be { recipe: { name, version }, item: { id, vars }, jobSize?, windows? }: ${parsed.error.message}`)
  const { recipe, item, jobSize, windows } = parsed.data
  const key = poolKey(access, crawlId.data)
  const running = pools.versionOf(key)
  if (running !== undefined && (running.name !== recipe.name || running.version !== recipe.version)) return problem(409, `crawl "${crawlId.data}" runs recipes "${running.name}" version "${running.version}"`)
  try {
    await findRecipes(settings.recipes, recipe.name, recipe.version)
  } catch (error) {
    return problem(error instanceof RecipeStoreError ? error.status : 400, error)
  }
  const instanceId = `${callerTag(access.caller)}${crawlId.data}:${item.id}`
  if (IN_PROGRESS.has(await statusOf(client, instanceId) ?? '')) return client.createCheckStatusResponse(request, instanceId)
  const job: ItemJob = {
    key,
    crawlId:      crawlId.data,
    allowedHosts: [...access.allowedHosts],
    recipe,
    item,
    resultName:   `${instanceId.replaceAll(':', '/')}.jsonl`,
    ...(jobSize !== undefined && { jobSize }),
    ...(windows !== undefined && { windows }),
  }
  await startOrchestration(client, orchestration, job, { instanceId })

  return client.createCheckStatusResponse(request, instanceId)
}

/** Two callers may use the same crawl and item ids: a short hash of the caller keeps their instances apart. */
function callerTag (caller: string | undefined): string {
  return caller === undefined ? '' : `${createHash('sha256').update(caller).digest('hex').slice(0, 12)}:`
}

/** The instance's runtime status; `undefined` when there is none (the client throws for an unknown instance). */
async function statusOf (client: DurableClient, instanceId: string): Promise<string | undefined> {
  try {
    const status = await client.getStatus(instanceId)

    return status.runtimeStatus
  } catch {
    return undefined
  }
}
