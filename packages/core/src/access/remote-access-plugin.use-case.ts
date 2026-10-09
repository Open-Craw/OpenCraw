import { randomUUID } from 'node:crypto'
import { calloutRequest, CalloutError } from '../callout-protocol'
import { commandTransport, httpTransport, markCallout, settleCallout } from '../callout-transport'
import type { CalloutPollingOptions, CalloutTransport, CommandTransportOptions, HttpTransportOptions } from '../callout-transport'
import { accessCalloutOutputSchema } from './access-callout.contract'
import type { AccessCalloutInput } from './access-callout.contract'
import type { AccessLease, AccessPlugin } from './access-plugin.contract'

/** How long a lease may stay `pending`, and nothing else: a lease is wanted now, so it is polled, never parked. */
export type RemoteAccessPluginOptions = CalloutPollingOptions

const NO_LOG = (): void => undefined

/**
 * An access plugin whose leases come from a handler outside the process (a program in any language, or a
 * service): a proxy from a REST call, a remote browser's URL, a rotating credential. A lease that gives
 * itself back (`release: true`) is released by calling the handler again when the run ends.
 *
 * @param name - The name a `{ kind: 'plugin', name }` profile refers to; sent in the request.
 * @param transport - How to reach the handler.
 * @param options - How long a `pending` lease may take.
 * @returns A plugin for `accessPlugins`.
 */
export function accessPluginVia (name: string, transport: CalloutTransport, options: RemoteAccessPluginOptions = {}): AccessPlugin {
  const ask = async (recipeId: string, input: AccessCalloutInput): Promise<unknown> => {
    const request = calloutRequest({ kind: 'access', name, input, recipeId })

    return await settleCallout(transport.label, request.idempotencyKey, async () => await transport.call(request, NO_LOG), { ...options, parkable: false })
  }

  const plugin: AccessPlugin = {
    name,
    lease: async (request) => {
      const output = await ask(request.recipeId, {
        phase:   'lease',
        nonce:   randomUUID(),
        request: {
          profile: request.profile,
          ...(request.country !== undefined && { country: request.country }),
          ...(request.sticky !== undefined && { sticky: request.sticky }),
          attempt: request.attempt,
          options: request.options,
        },
      })
      const parsed = accessCalloutOutputSchema.safeParse(output)
      if (!parsed.success) throw new CalloutError(transport.label, `the answer is not an access lease (${parsed.error.issues[0]?.message ?? 'invalid'}): expected { proxy?, cdp?, session?, headers?, … }`)
      const { release, ...lease } = parsed.data
      const given: Omit<AccessLease, 'profile' | 'kind'> = { ...lease }
      if (release === true) {
        given.release = async () => {
          try {
            await ask(request.recipeId, { phase: 'release', profile: request.profile, ...(lease.session !== undefined && { session: lease.session }) })
          } catch {
            // Giving a lease back is best effort: the run has ended, and the service expires what it is not told about.
          }
        }
      }

      return given
    },
  }

  return markCallout(plugin, transport.label)
}

/**
 * An access plugin that runs a local program: the request is on its stdin, the answer on its stdout.
 *
 * @param name - The plugin's name in `{ kind: 'plugin', name }`.
 * @param command - The program and its arguments.
 * @param options - Transport and wait options.
 * @returns A plugin for `accessPlugins`.
 */
export function commandAccessPlugin (name: string, command: readonly [string, ...string[]], options: RemoteAccessPluginOptions & CommandTransportOptions = {}): AccessPlugin {
  return accessPluginVia(name, commandTransport(command, options), options)
}

/**
 * An access plugin that calls a service: the request is the body of a POST, the answer its response.
 *
 * @param name - The plugin's name in `{ kind: 'plugin', name }`.
 * @param url - The endpoint.
 * @param options - Transport and wait options.
 * @returns A plugin for `accessPlugins`.
 */
export function httpAccessPlugin (name: string, url: string, options: RemoteAccessPluginOptions & HttpTransportOptions = {}): AccessPlugin {
  return accessPluginVia(name, httpTransport(url, options), options)
}
