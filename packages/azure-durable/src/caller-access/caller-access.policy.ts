import type { HttpRequest } from '@azure/functions'

/** Who is calling and where their recipes may go. */
export interface CallerAccess {
  /** `undefined` when the host does not tell callers apart. */
  caller?:      string
  allowedHosts: readonly string[]
}

export interface CallerRules {
  allowedHosts: readonly string[] | ((caller: string | undefined) => readonly string[] | undefined)
  identify?:    (request: HttpRequest) => string | undefined
}

/**
 * Resolves the caller of a request and the hosts its recipes may reach.
 *
 * @param request - The request.
 * @param rules - The host's `identify` and `allowedHosts`.
 * @returns The access, or `undefined` when this caller may run nothing.
 */
export function callerAccess (request: HttpRequest, rules: CallerRules): CallerAccess | undefined {
  const caller = rules.identify?.(request)
  const allowedHosts = typeof rules.allowedHosts === 'function' ? rules.allowedHosts(caller) : rules.allowedHosts
  if (allowedHosts === undefined || allowedHosts.length === 0) return undefined

  return { ...(caller !== undefined && { caller }), allowedHosts }
}

/**
 * The key a caller's pools and jobs live under, so two callers never share a pool.
 *
 * @param access - The caller.
 * @param crawlId - The job.
 * @returns The key.
 */
export function poolKey (access: Pick<CallerAccess, 'caller'>, crawlId: string): string {
  return `${access.caller ?? ''}\u{0}${crawlId}`
}
