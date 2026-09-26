import { EventBus } from '../crawl-events'
import type { CrawlEvent } from '../crawl-events'
import { HostThrottle } from './host-throttle.policy'
import { RunGate } from './run-gate.policy'
import { DEFAULT_RETRY_RULE, resolveRetryRule, retryDelay, transientError, withTransportRetry } from './transport-retry.policy'

describe('transport retry', () => {
  it('layers the recipe over the crawler over the defaults', () => {
    expect(resolveRetryRule()).toEqual(DEFAULT_RETRY_RULE)
    expect(resolveRetryRule({ attempts: 5 }, { attempts: 2, backoffMs: 10 })).toEqual({ ...DEFAULT_RETRY_RULE, attempts: 5, backoffMs: 10 })
    expect(resolveRetryRule({ attempts: undefined }, { attempts: 1 }).attempts).toBe(1)
  })

  it('tells connection failures from answers', () => {
    expect(transientError(new Error('apiRequestContext.fetch: read ECONNRESET'))).toEqual({ reason: 'ECONNRESET' })
    expect(transientError(new Error('page.goto: net::ERR_CONNECTION_RESET at https://x/'))).toEqual({ reason: 'net::ERR_CONNECTION_RESET' })
    expect(transientError(new Error('page.goto: Timeout 30000ms exceeded.'))).toEqual({ reason: 'Timeout 30000ms exceeded' })
    expect(transientError(new Error('page.goto: net::ERR_TOO_MANY_RETRIES at https://x/'))).toEqual({ reason: 'net::ERR_TOO_MANY_RETRIES' })
    expect(transientError(new Error('getaddrinfo ENOTFOUND shop.exampel'))).toBeUndefined()
    expect(transientError(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBeUndefined()
    expect(transientError(new Error('no match for .price'))).toBeUndefined()
  })

  it('backs off exponentially with jitter, honours Retry-After, and refuses a wait past the cap', () => {
    const rule = { ...DEFAULT_RETRY_RULE, backoffMs: 1000, maxDelayMs: 30_000 }
    expect(retryDelay(rule, 1)).toBeGreaterThanOrEqual(750)
    expect(retryDelay(rule, 1)).toBeLessThanOrEqual(1250)
    expect(retryDelay(rule, 3)).toBeGreaterThanOrEqual(3000)
    expect(retryDelay(rule, 10)).toBe(30_000)
    expect(retryDelay(rule, 1, '2')).toBe(2000)
    expect(retryDelay(rule, 1, 'Sat, 26 Sep 2026 00:00:05 GMT', Date.parse('Sat, 26 Sep 2026 00:00:00 GMT'))).toBe(5000)
    expect(retryDelay(rule, 1, '3600')).toBeUndefined()
    expect(retryDelay(rule, 1, 'soon')).toBeGreaterThanOrEqual(750)
  })

  it('sends again while the outcome is transient, then returns or throws the last one', async () => {
    const events: CrawlEvent[] = []
    const context = { recipeId: 'r', gate: new RunGate(1, 0), events: new EventBus((event) => { events.push(event) }), rule: { ...DEFAULT_RETRY_RULE, backoffMs: 1 } }
    let calls = 0
    const flaky = {
      run: async () => {
        calls += 1; if (calls < 3) throw new Error('read ECONNRESET')

        return 'ok'
      },
      problem: (outcome: { value: string } | { error: unknown }) => ('error' in outcome ? transientError(outcome.error) : undefined),
    }
    await expect(withTransportRetry('https://a.example/', flaky, context)).resolves.toBe('ok')
    expect(events.map(event => (event.type === 'request:retry' ? [event.attempt, event.reason] : event.type))).toEqual([[2, 'ECONNRESET'], [3, 'ECONNRESET']])
    calls = -10
    await expect(withTransportRetry('https://a.example/', flaky, context)).rejects.toThrow('ECONNRESET')
    const permanent = { run: async () => { throw new Error('HTTP 404') }, problem: () => undefined }
    events.length = 0
    await expect(withTransportRetry('https://a.example/', permanent, context)).rejects.toThrow('HTTP 404')
    expect(events).toEqual([])
  })

  it('under a time budget alone counts no tries; with attempts too, stops at whichever runs out first', () => {
    expect(resolveRetryRule({ forMs: 60_000 }).attempts).toBe(Infinity)
    expect(resolveRetryRule({ forMs: 60_000, attempts: 4 }).attempts).toBe(4)
    expect(resolveRetryRule({ forMs: 60_000 }, { attempts: 2 }).attempts).toBe(2)
    expect(resolveRetryRule(undefined, { forMs: 1000 })).toMatchObject({ forMs: 1000, attempts: Infinity })
  })

  it('keeps trying through an outage until the budget ends, the last pause cut to fit', async () => {
    const events: CrawlEvent[] = []
    const context = { recipeId: 'r', gate: new RunGate(1, 0), events: new EventBus((event) => { events.push(event) }), rule: resolveRetryRule({ forMs: 300, backoffMs: 20, maxDelayMs: 40 }) }
    const down = { run: async () => 404, problem: () => ({ reason: 'HTTP 404' }) }
    const started = Date.now()
    await expect(withTransportRetry('https://a.example/', down, context)).resolves.toBe(404)
    const took = Date.now() - started
    const retries = events.filter(event => event.type === 'request:retry')
    // More tries than the default 3, all within the budget, with no pause over maxDelayMs.
    expect(retries.length).toBeGreaterThan(5)
    expect(took).toBeGreaterThanOrEqual(250)
    expect(took).toBeLessThan(600)
    expect(retries.every(event => event.type === 'request:retry' && event.delayMs <= 40)).toBe(true)

    let calls = 0
    const recovers = {
      run: async () => {
        calls += 1

        return calls < 8 ? 404 : 200
      },
      problem: (outcome: { value: number } | { error: unknown }) => ('value' in outcome && outcome.value === 404 ? { reason: 'HTTP 404' } : undefined),
    }
    await expect(withTransportRetry('https://a.example/', recovers, { ...context, rule: resolveRetryRule({ forMs: 5000, backoffMs: 1, maxDelayMs: 2 }) })).resolves.toBe(200)
  })

  it('holds the whole site back for a Retry-After', async () => {
    const hosts = new HostThrottle()
    const pause = jest.spyOn(hosts, 'pause')
    const context = { recipeId: 'r', gate: new RunGate(1, 0, hosts), events: new EventBus(), rule: DEFAULT_RETRY_RULE }
    let calls = 0
    const limited = {
      run: async () => {
        calls += 1

        return calls === 1 ? 429 : 200
      },
      problem: (outcome: { value: number } | { error: unknown }) => ('value' in outcome && outcome.value === 429 ? { reason: 'HTTP 429', retryAfter: '0' } : undefined),
    }
    await expect(withTransportRetry('https://a.example/x', limited, context)).resolves.toBe(200)
    expect(pause).toHaveBeenCalledWith('https://a.example/x', expect.any(Number))
  })
})
