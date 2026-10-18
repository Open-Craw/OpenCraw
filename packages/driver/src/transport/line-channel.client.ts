import type { Readable, Writable } from 'node:stream'
import { createInterface } from 'node:readline'
import { RPC_ERRORS, RpcFailure } from './json-rpc.contract'
import type { RpcError, RpcMessage } from './json-rpc.contract'

/** Answers a request: its result, or a thrown error (an `RpcFailure` for a specific code). */
export type RequestHandler = (method: string, params: unknown) => Promise<unknown>

/** JSON-RPC 2.0 both ways over a stream pair, one message per line. */
export interface LineChannel {
  /** Sends a request to the other side and waits for its result; rejects with its error. */
  request: (method: string, params: unknown) => Promise<unknown>
  /** Sends a notification: no answer is expected. */
  notify:  (method: string, params: unknown) => void
  /** Settles when the input ends (the other side closed it, or went away). */
  closed:  Promise<void>
  /** Settles once every request read so far has been answered: what to wait for before stopping. */
  drained: () => Promise<void>
}

const isRequestId = (id: unknown): id is number | string => typeof id === 'number' || typeof id === 'string'

/**
 * Opens a channel: every line read from `input` is a JSON-RPC message. A request goes to `handle` and its
 * answer is written back; a response settles the matching `request`. A line that is not JSON gets a parse
 * error, a message without `jsonrpc: "2.0"` an invalid-request error, and nothing it does stops the channel.
 * Writes are one line each, never interleaved.
 *
 * @param input - Where messages arrive (the driver's stdin).
 * @param output - Where they go (the driver's stdout).
 * @param handle - What answers the other side's requests and notifications.
 * @returns The channel.
 */
export function openLineChannel (input: Readable, output: Writable, handle: RequestHandler): LineChannel {
  const pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()
  // Answers still being worked out: a client may write its last requests and close its end at once.
  const answering = new Set<Promise<void>>()
  const track = (answered: Promise<void>): void => {
    answering.add(answered)
    void (async () => {
      try {
        await answered
      } finally {
        answering.delete(answered)
      }
    })()
  }
  let nextId = 1
  const write = (message: RpcMessage): void => { output.write(`${JSON.stringify(message)}\n`) }
  const fail = (id: number | string | null, error: RpcError): void => { write({ jsonrpc: '2.0', id, error }) }

  const answer = async (message: RpcMessage): Promise<void> => {
    const method = message.method as string
    try {
      const result = await handle(method, message.params)
      if (isRequestId(message.id)) write({ jsonrpc: '2.0', id: message.id, result: result ?? null })
    } catch (error) {
      if (!isRequestId(message.id)) return
      if (error instanceof RpcFailure) fail(message.id, { code: error.code, message: error.message, ...(error.data !== undefined && { data: error.data }) })
      else fail(message.id, { code: RPC_ERRORS.server, message: error instanceof Error ? error.message : String(error) })
    }
  }

  const settle = (message: RpcMessage): void => {
    const waiting = typeof message.id === 'number' ? pending.get(message.id) : undefined
    if (waiting === undefined) return
    pending.delete(message.id as number)
    if (message.error === undefined) waiting.resolve(message.result)
    else waiting.reject(new RpcFailure(message.error.code, message.error.message, message.error.data))
  }

  const lines = createInterface({ input, crlfDelay: Infinity })
  lines.on('line', (line) => {
    if (line.trim() === '') return
    let message: RpcMessage
    try {
      message = JSON.parse(line) as RpcMessage
    } catch {
      fail(null, { code: RPC_ERRORS.parse, message: 'the line is not JSON' })

      return
    }
    if (message === null || typeof message !== 'object' || message.jsonrpc !== '2.0') {
      fail(isRequestId(message?.id) ? message.id : null, { code: RPC_ERRORS.invalidRequest, message: 'not a JSON-RPC 2.0 message' })

      return
    }
    if (typeof message.method === 'string') track(answer(message))
    else settle(message)
  })

  const closed = new Promise<void>((resolve) => {
    lines.on('close', () => {
      for (const waiting of pending.values()) waiting.reject(new Error('the client closed the channel'))
      pending.clear()
      resolve()
    })
  })

  return {
    request: async (method, params) => await new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      write({ jsonrpc: '2.0', id, method, params })
    }),
    notify:  (method, params) => { write({ jsonrpc: '2.0', method, params }) },
    closed,
    drained: async () => {
      while (answering.size > 0) await Promise.allSettled(answering)
    },
  }
}
