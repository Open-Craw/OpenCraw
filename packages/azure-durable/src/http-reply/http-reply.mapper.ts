import type { HttpRequest, HttpResponseInit } from '@azure/functions'

/**
 * @param status - The HTTP status.
 * @param body - A JSON body.
 * @returns The response.
 */
export function reply (status: number, body: unknown): HttpResponseInit {
  return { status, jsonBody: body }
}

/**
 * An error the caller can act on: what went wrong, and the issues a recipe
 * error lists (each with its JSON path).
 *
 * @param status - The HTTP status.
 * @param error - What went wrong.
 * @returns The response.
 */
export function problem (status: number, error: unknown): HttpResponseInit {
  const message = error instanceof Error ? error.message : String(error)
  const issues = typeof error === 'object' && error !== null && 'issues' in error ? (error).issues : undefined

  return reply(status, { error: message, ...(issues !== undefined && { issues }) })
}

/**
 * The request body as JSON.
 *
 * @param request - The request.
 * @returns The body, or `undefined` when it is not JSON.
 */
export async function readJson (request: HttpRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
