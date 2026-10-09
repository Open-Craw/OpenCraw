import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { calloutResolutionSchema } from '@opencraw/core'
import type { DurableClient } from 'durable-functions'
import type { HostSettings } from '../host-options'
import { problem, readJson, reply } from '../http-reply'
import { calloutEventName } from './callout-event.mapper'
import { readCalloutTicket } from './callout-ticket.algorithm'

/**
 * `POST /callouts/{token}/resolve`: a handler that answered `pending` posts the result of the call here.
 * The token in the path is the credential (it is a signed ticket for that one call), so the route does
 * not ask for a function key. The result is raised to the waiting job as an external event; a second post
 * for a call that was already settled finds nobody waiting and is refused.
 *
 * @param request - The request.
 * @param client - The Durable client.
 * @param settings - The host settings.
 * @param now - The current time, epoch milliseconds.
 * @returns 202 when the result was handed to the job, or the problem.
 */
export async function resolveCallout (request: HttpRequest, client: DurableClient, settings: HostSettings, now: number = Date.now()): Promise<HttpResponseInit> {
  const callouts = settings.callouts
  if (callouts === undefined) return problem(404, 'this host does not take posted-back results')
  const secret = process.env[callouts.signingKeyEnv]
  if (secret === undefined || secret === '') return problem(500, 'the host has no signing key for posted-back results')
  const reading = readCalloutTicket(secret, request.params.token ?? '', now)
  if (!reading.ok) return problem(reading.reason === 'expired' ? 410 : 401, `the token is ${reading.reason === 'expired' ? 'expired' : 'not valid'}`)

  const parsed = calloutResolutionSchema.safeParse(await readJson(request))
  if (!parsed.success) return problem(400, `the body must be {"status":"ok","output":…} or {"status":"error","error":"…"}: ${parsed.error.message}`)

  const { instanceId, index, key } = reading.ticket
  const status = await client.getStatus(instanceId)
  if (status === undefined || status.runtimeStatus !== 'Running') return problem(410, 'the job this result is for is no longer waiting for it')
  await client.raiseEvent(instanceId, calloutEventName(index, key), parsed.data)

  return reply(202, { status: 'accepted' })
}
