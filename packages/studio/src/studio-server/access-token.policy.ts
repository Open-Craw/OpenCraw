import { randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

/** The cookie set on the page's own document response, so its own asset and API requests carry the token too. */
export const TOKEN_COOKIE = 'opencraw_token'

/** A random token, generated once at server startup and required on every request. */
export function generateToken (): string {
  return randomBytes(24).toString('hex')
}

/**
 * The token a request carries, checked in this order: the `x-opencraw-token`
 * header, the `token` query param, the studio's own cookie (set after the
 * first authenticated document request, so a browser's own asset and API
 * requests need not repeat the query param).
 *
 * @param request - The incoming request.
 * @param query - Its URL's query string, parsed.
 * @returns The token found, or `undefined`.
 */
export function tokenOf (request: Pick<IncomingMessage, 'headers'>, query: URLSearchParams): string | undefined {
  const header = request.headers['x-opencraw-token']
  if (typeof header === 'string') return header
  const fromQuery = query.get('token')

  return fromQuery ?? cookieToken(request.headers.cookie)
}

/**
 * Whether a request proves it holds the server's token.
 *
 * @param expected - The server's token.
 * @param request - The incoming request.
 * @param query - Its URL's query string, parsed.
 * @returns Whether the request is authorized.
 */
export function isAuthorized (expected: string, request: Pick<IncomingMessage, 'headers'>, query: URLSearchParams): boolean {
  return tokenOf(request, query) === expected
}

function cookieToken (header: string | undefined): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === TOKEN_COOKIE) return rest.join('=')
  }

  return undefined
}
