import { once } from 'node:events'
import type { Readable, Writable } from 'node:stream'
import type { z } from 'zod'
import { cancelParamsSchema, initializeParamsSchema, PROTOCOL_VERSION, runParamsSchema, validateParamsSchema } from '../protocol'
import type { InitializeResult } from '../protocol'
import { runSessions, validateRecipes } from '../session'
import { openLineChannel, RPC_ERRORS, RpcFailure } from '../transport'

/** What the driver says about itself in `initialize`. */
export interface DriverIdentity {
  driverVersion: string
}

const METHODS = ['initialize', 'validate', 'run', 'cancel', 'shutdown']

const major = (version: string): string => version.split('.', 1)[0]

function parsed<T> (schema: z.ZodType<T>, params: unknown): T {
  const result = schema.safeParse(params ?? {})
  if (!result.success) throw new RpcFailure(RPC_ERRORS.invalidParams, result.error.issues.map(issue => `${issue.path.join('.') || '(params)'}: ${issue.message}`).join('; '), result.error.issues)

  return result.data
}

/**
 * Serves the driver protocol on a stream pair until the client closes its end or asks for `shutdown`.
 * Every method but `initialize` is refused until the client has initialized with a protocol of the same
 * major. On close, every run still going is closed.
 *
 * @param input - Where the client's messages arrive (stdin).
 * @param output - Where the driver's go (stdout). Nothing else may write to it.
 * @param identity - The driver's version, for `initialize`.
 * @returns Settles once the driver has stopped.
 */
export async function serveDriver (input: Readable, output: Writable, identity: DriverIdentity): Promise<void> {
  let initialized = false
  const stopping = new AbortController()

  const channel = openLineChannel(input, output, async (method, params) => {
    if (method === 'initialize') {
      const hello = parsed(initializeParamsSchema, params)
      if (major(hello.protocolVersion) !== major(PROTOCOL_VERSION)) throw new RpcFailure(RPC_ERRORS.server, `this driver speaks protocol ${PROTOCOL_VERSION}; ${hello.clientName} ${hello.clientVersion} asked for ${hello.protocolVersion}: use a client for protocol ${major(PROTOCOL_VERSION)}.x`)
      initialized = true
      const result: InitializeResult = { driverVersion: identity.driverVersion, protocolVersion: PROTOCOL_VERSION, methods: METHODS }

      return result
    }
    if (!METHODS.includes(method)) throw new RpcFailure(RPC_ERRORS.methodNotFound, `no method "${method}": the driver has ${METHODS.join(', ')}`)
    if (!initialized) throw new RpcFailure(RPC_ERRORS.server, 'call initialize first')
    if (method === 'validate') return await validateRecipes(parsed(validateParamsSchema, params))
    if (method === 'run') return { runId: await sessions.start(parsed(runParamsSchema, params)) }
    if (method === 'cancel') return { cancelled: await sessions.cancel(parsed(cancelParamsSchema, params).runId) }
    // shutdown: stop once this answer is written.
    await sessions.closeAll()
    setImmediate(() => { stopping.abort() })

    return {}
  })
  const sessions = runSessions(channel.notify, channel.request)

  await Promise.race([channel.closed, once(stopping.signal, 'abort')])
  // Answer what was asked before the client closed its end or asked to stop: a client may write its last
  // requests and close stdin at once.
  await channel.drained()
  await sessions.closeAll()
}
