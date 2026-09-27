import { HttpRequest } from '@azure/functions'
import { callerAccess, poolKey } from './caller-access.policy'

const request = (headers: Record<string, string> = {}): HttpRequest => new HttpRequest({ method: 'POST', url: 'http://host/api/crawl', headers })

describe('callerAccess', () => {
  it('gives every caller the same hosts when the host has one list', () => {
    expect(callerAccess(request(), { allowedHosts: ['example.com'] })).toEqual({ allowedHosts: ['example.com'] })
  })

  it('decides per caller, and refuses a caller with no hosts', () => {
    const rules = {
      identify:     (incoming: HttpRequest) => incoming.headers.get('x-ms-client-principal-name') ?? undefined,
      allowedHosts: (caller: string | undefined) => (caller === 'team-a' ? ['a.example'] : undefined),
    }
    expect(callerAccess(request({ 'x-ms-client-principal-name': 'team-a' }), rules)).toEqual({ caller: 'team-a', allowedHosts: ['a.example'] })
    expect(callerAccess(request({ 'x-ms-client-principal-name': 'team-b' }), rules)).toBeUndefined()
    expect(callerAccess(request(), rules)).toBeUndefined()
  })

  it('keeps two callers\' pools apart', () => {
    expect(poolKey({ caller: 'a' }, 'job')).not.toBe(poolKey({ caller: 'b' }, 'job'))
    expect(poolKey({}, 'job')).not.toBe(poolKey({ caller: 'job' }, ''))
  })
})
