import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { callerAccess, poolKey } from '../caller-access'
import type { HostSettings } from '../host-options'
import { problem, reply } from '../http-reply'
import { crawlIdSchema } from './item-request.validator'
import type { WorkerPools } from './worker-pools.store'

/**
 * `GET /jobs/{crawlId}`: the pool's state. `DELETE /jobs/{crawlId}`: closes
 * it; queued and running items finish first.
 *
 * @param request - The request.
 * @param settings - The host settings.
 * @param pools - This process's pools.
 * @returns The state, 202 when closing, 404 when there is no pool.
 */
export async function jobRequest (request: HttpRequest, settings: HostSettings, pools: WorkerPools): Promise<HttpResponseInit> {
  const access = callerAccess(request, settings)
  if (access === undefined) return problem(403, 'this caller may not run recipes here')
  const crawlId = crawlIdSchema.safeParse(request.params.crawlId)
  if (!crawlId.success) return problem(400, `crawl id: ${crawlId.error.issues[0]?.message ?? 'invalid'}`)
  const key = poolKey(access, crawlId.data)
  const state = pools.state(key)
  if (state === undefined) return problem(404, `no pool for crawl "${crawlId.data}" in this instance`)
  if (request.method === 'DELETE') {
    void pools.close(key)

    return reply(202, { ...state, closing: true })
  }

  return reply(200, state)
}
