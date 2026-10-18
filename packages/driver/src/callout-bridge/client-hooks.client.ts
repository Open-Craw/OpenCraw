import { calloutHook, calloutResponseSchema } from '@opencraw/core'
import type { CalloutTransport, HookMap } from '@opencraw/core'

/** Sends one request to the client and waits for its answer: the channel's `request`. */
export type AskClient = (method: string, params: unknown) => Promise<unknown>

/**
 * A transport whose handler is the client: each call is a `callout` request carrying core's own
 * `CalloutRequest`, and the client answers with a `CalloutResponse`, so `pending` and idempotency keys
 * work exactly as they do for a command or an HTTP hook.
 */
export function clientTransport (hookName: string, runId: string, ask: AskClient): CalloutTransport {
  return {
    label: `client hook ${hookName}`,
    call:  async (request) => calloutResponseSchema.parse(await ask('callout', { runId, request })),
  }
}

/**
 * The hooks a run's client serves, each answered by the client over the channel.
 *
 * @param names - The hooks the client said it serves.
 * @param runId - The run they belong to, sent with every callout.
 * @param ask - The channel's request.
 * @returns A hook map for `createCrawler`.
 */
export function clientHooks (names: readonly string[], runId: string, ask: AskClient): HookMap {
  return Object.fromEntries(names.map(name => [name, calloutHook(name, clientTransport(name, runId, ask))]))
}
