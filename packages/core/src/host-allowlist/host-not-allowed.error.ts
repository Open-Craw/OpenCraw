/** A request to a host outside the crawler's `allowedHosts`, or to a scheme that never leaves through the network (`file:`). */
export class HostNotAllowedError extends Error {
  constructor (readonly url: string, readonly allowed: readonly string[]) {
    super(`${url} is outside the allowed hosts (${allowed.join(', ')})`)
    this.name = 'HostNotAllowedError'
  }
}
