import { HostNotAllowedError } from './host-not-allowed.error'

/** Schemes that never leave the page's own memory: always allowed. */
const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:'])
/** Schemes a host pattern applies to; every other scheme (`file:`, `chrome:`...) is refused. */
const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:'])
const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443' }
const PATTERN = /^(?<wildcard>\*\.)?(?<host>\[[\da-f:.]+\]|[\da-z-]+(?:\.[\da-z-]+)*)(?::(?<port>\d{1,5}))?$/i

interface HostPattern {
  host:     string
  wildcard: boolean
  port?:    string
}

/**
 * The hosts a crawler may reach, for one that runs recipes it does not trust.
 * A pattern is a host (`example.com`), a host and its subdomains
 * (`*.example.com`), or `*` for any host; `:port` narrows it to one port.
 * Only network schemes are ever matched: `file:` and the like are refused
 * whatever the list says, while `data:`, `blob:` and `about:` never leave
 * the page and pass.
 */
export class HostAllowlist {
  /**
   * An allowlist, or none when no hosts are given.
   *
   * @param hosts - The patterns, if any.
   * @returns The allowlist, or `undefined` for no limit.
   */
  static of (hosts: readonly string[] | undefined): HostAllowlist | undefined {
    return hosts === undefined ? undefined : new HostAllowlist(hosts)
  }

  private readonly patterns: HostPattern[]
  private readonly any:      boolean

  /**
   * @param hosts - The patterns.
   * @throws Error for a pattern that is not a host (a URL, a path, an empty string).
   */
  constructor (readonly hosts: readonly string[]) {
    this.any = hosts.includes('*')
    this.patterns = hosts.filter(host => host !== '*').map((host) => {
      const match = PATTERN.exec(host.trim())
      if (match?.groups === undefined) throw new Error(`allowedHosts: "${host}" is not a host pattern (example.com, *.example.com, example.com:8080 or *)`)

      return { host: match.groups.host.toLowerCase(), wildcard: match.groups.wildcard !== undefined, ...(match.groups.port !== undefined && { port: match.groups.port }) }
    })
  }

  /**
   * @param url - An absolute URL.
   * @returns Whether a request to it may go.
   */
  allows (url: string): boolean {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    if (LOCAL_SCHEMES.has(parsed.protocol)) return true
    if (!NETWORK_SCHEMES.has(parsed.protocol)) return false
    if (this.any) return true
    const host = parsed.hostname.toLowerCase()
    const port = parsed.port === '' ? DEFAULT_PORTS[parsed.protocol] : parsed.port

    return this.patterns.some(pattern => (pattern.port === undefined || pattern.port === port) && (host === pattern.host || (pattern.wildcard && host.endsWith(`.${pattern.host}`))))
  }

  /**
   * @param url - An absolute URL.
   * @throws HostNotAllowedError when a request to it may not go.
   */
  assert (url: string): void {
    if (!this.allows(url)) throw new HostNotAllowedError(url, this.hosts)
  }
}
