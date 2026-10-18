/** JSON-RPC 2.0 error codes the driver answers with. */
export const RPC_ERRORS = {
  parse:          -32_700,
  invalidRequest: -32_600,
  methodNotFound: -32_601,
  invalidParams:  -32_602,
  internal:       -32_603,
  /** A failure the caller must act on: the message says what to do. */
  server:         -32_000,
} as const

export interface RpcError { code: number, message: string, data?: unknown }

/** A request (it has an id and wants a response) or a notification (no id). */
export interface RpcMessage {
  jsonrpc: '2.0'
  id?:     number | string | null
  method?: string
  params?: unknown
  result?: unknown
  error?:  RpcError
}

/** An error a method handler throws to answer with a code other than `server`. */
export class RpcFailure extends Error {
  readonly code: number
  readonly data: unknown

  constructor (code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'RpcFailure'
    this.code = code
    this.data = data
  }
}
