import { HostAllowlist } from './host-allowlist.policy'
import { HostNotAllowedError } from './host-not-allowed.error'

describe('HostAllowlist', () => {
  it('matches a host exactly, and a wildcard its subdomains and the host itself', () => {
    const list = new HostAllowlist(['example.com', '*.site.org'])
    expect(list.allows('https://example.com/a')).toBe(true)
    expect(list.allows('https://EXAMPLE.com')).toBe(true)
    expect(list.allows('https://www.example.com/')).toBe(false)
    expect(list.allows('https://site.org/')).toBe(true)
    expect(list.allows('https://a.b.site.org/')).toBe(true)
    expect(list.allows('https://evilsite.org/')).toBe(false)
    expect(list.allows('https://site.org.evil.com/')).toBe(false)
  })

  it('narrows a pattern to a port, counting default ports', () => {
    const list = new HostAllowlist(['127.0.0.1:8080', 'api.example.com:443'])
    expect(list.allows('http://127.0.0.1:8080/x')).toBe(true)
    expect(list.allows('http://127.0.0.1:9090/x')).toBe(false)
    expect(list.allows('https://api.example.com/')).toBe(true)
    expect(list.allows('https://api.example.com:8443/')).toBe(false)
    expect(list.allows('wss://api.example.com/socket')).toBe(true)
  })

  it('refuses file: and other local schemes whatever the list, and lets data:, blob: and about: pass', () => {
    const any = new HostAllowlist(['*'])
    expect(any.allows('https://anything.test/')).toBe(true)
    expect(any.allows('file:///etc/passwd')).toBe(false)
    expect(any.allows('chrome://settings')).toBe(false)
    expect(any.allows('data:text/html,<p>x</p>')).toBe(true)
    expect(any.allows('about:blank')).toBe(true)
    expect(any.allows('not a url')).toBe(false)
  })

  it('matches IPv6 hosts', () => {
    const list = new HostAllowlist(['[::1]:3000'])
    expect(list.allows('http://[::1]:3000/')).toBe(true)
    expect(list.allows('http://[::2]:3000/')).toBe(false)
  })

  it('throws a HostNotAllowedError naming the URL and the list', () => {
    const list = new HostAllowlist(['example.com'])
    expect(() => { list.assert('http://10.0.0.1/admin') }).toThrow(HostNotAllowedError)
    expect(() => { list.assert('http://10.0.0.1/admin') }).toThrow('http://10.0.0.1/admin is outside the allowed hosts (example.com)')
  })

  it('refuses a pattern that is not a host', () => {
    expect(() => new HostAllowlist(['https://example.com'])).toThrow('is not a host pattern')
    expect(() => new HostAllowlist(['example.com/path'])).toThrow('is not a host pattern')
    expect(() => new HostAllowlist([''])).toThrow('is not a host pattern')
    expect(HostAllowlist.of(undefined)).toBeUndefined()
  })
})
