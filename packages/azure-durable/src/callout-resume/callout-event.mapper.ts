import type { HostSettings } from '../host-options'

/**
 * The name of the external event a posted-back result is raised as. The call's idempotency key is the
 * same for the same call anywhere in the job, so the recipe's index keeps two recipes that make an
 * identical call apart.
 *
 * @param index - The input recipe of the job.
 * @param key - The call's idempotency key.
 * @returns The event name.
 */
export function calloutEventName (index: number, key: string): string {
  return `opencraw-callout:${String(index)}:${key}`
}

/**
 * Where a handler posts a result, given the URL the job was started at.
 *
 * `publicUrl` wins when the host sets it (behind a proxy or a custom domain the request does not show);
 * otherwise it is the start URL without its last path segment, which is where `/crawl` and
 * `/callouts/{token}/resolve` are siblings.
 *
 * @param startUrl - The URL of the `/crawl` request.
 * @param settings - The host settings.
 * @returns The base all callback URLs start with, without a trailing slash.
 */
export function callbackBaseOf (startUrl: string, settings: Pick<HostSettings, 'callouts'>): string {
  const configured = settings.callouts?.publicUrl
  if (configured !== undefined) return configured.replace(/\/+$/, '')
  const url = new URL(startUrl)

  return `${url.origin}${url.pathname.replace(/\/[^/]*\/?$/, '')}`
}

/**
 * @param base - What `callbackBaseOf` returned.
 * @param token - The signed ticket.
 * @returns The URL a handler posts its `CalloutResolution` to.
 */
export function callbackUrl (base: string, token: string): string {
  return `${base}/callouts/${token}/resolve`
}
