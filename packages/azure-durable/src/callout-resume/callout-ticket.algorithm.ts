import { createHmac, timingSafeEqual } from 'node:crypto'

/** What a resume token says: which call of which recipe of which job it may settle, and until when. */
export interface CalloutTicket {
  instanceId: string
  /** The input recipe of the job the call belongs to. */
  index:      number
  /** The call's idempotency key. */
  key:        string
  /** Epoch milliseconds. */
  expiresAt:  number
}

export type TicketReading =
  | { ok: true, ticket: CalloutTicket } |
  { ok: false, reason: 'malformed' | 'signature' | 'expired' }

const SEPARATOR = '.'

function signature (secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * The token a handler posts its result back with. It is the ticket and an HMAC of it, so the host holds no
 * state for it: any instance of the Function App can check it.
 *
 * @param secret - The host's signing key.
 * @param ticket - What the token lets its holder do.
 * @returns A URL-safe token.
 */
export function signCalloutTicket (secret: string, ticket: CalloutTicket): string {
  const payload = Buffer.from(JSON.stringify(ticket), 'utf8').toString('base64url')

  return `${payload}${SEPARATOR}${signature(secret, payload)}`
}

/**
 * Checks a token and reads the ticket in it.
 *
 * @param secret - The host's signing key.
 * @param token - What was posted to.
 * @param now - The current time, epoch milliseconds.
 * @returns The ticket, or why the token is not good.
 */
export function readCalloutTicket (secret: string, token: string, now: number): TicketReading {
  const [payload, given, ...rest] = token.split(SEPARATOR)
  if (payload === undefined || given === undefined || rest.length > 0) return { ok: false, reason: 'malformed' }
  const expected = Buffer.from(signature(secret, payload))
  const actual = Buffer.from(given)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: 'signature' }
  let ticket: CalloutTicket
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CalloutTicket
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof ticket.instanceId !== 'string' || typeof ticket.key !== 'string' || typeof ticket.index !== 'number' || typeof ticket.expiresAt !== 'number') return { ok: false, reason: 'malformed' }
  if (ticket.expiresAt < now) return { ok: false, reason: 'expired' }

  return { ok: true, ticket }
}
