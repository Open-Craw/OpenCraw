import type { CalloutResponse } from './callout.contract'
import { CalloutError } from './callout.error'
import { settleCallout } from './callout-polling.use-case'

/** An attempt that answers from a list, one per call, and counts its calls. */
function answers (...list: CalloutResponse[]) {
  const calls: number[] = []
  const attempt = (): Promise<CalloutResponse> => {
    calls.push(Date.now())

    return Promise.resolve(list[Math.min(calls.length, list.length) - 1])
  }

  return { attempt, calls }
}

const failingAttempt = (): Promise<CalloutResponse> => Promise.reject(new CalloutError('svc', 'down'))

describe('settleCallout', () => {
  it('returns the output of an ok answer without waiting', async () => {
    const { attempt, calls } = answers({ status: 'ok', output: 7 })

    expect(await settleCallout('svc', attempt)).toBe(7)
    expect(calls).toHaveLength(1)
  })

  it('asks again after a pending answer, waiting what the handler says, until it settles', async () => {
    const { attempt, calls } = answers({ status: 'pending', retryAfterMs: 40 }, { status: 'pending', retryAfterMs: 40 }, { status: 'ok', output: 'done' })

    expect(await settleCallout('svc', attempt)).toBe('done')

    expect(calls).toHaveLength(3)
    expect((calls[2]) - (calls[0])).toBeGreaterThanOrEqual(70)
  })

  it('throws the reason of an error answer that follows a pending one', async () => {
    const { attempt } = answers({ status: 'pending', retryAfterMs: 1 }, { status: 'error', error: 'rejected' })

    await expect(settleCallout('svc', attempt)).rejects.toThrow('svc: rejected')
  })

  it('fails when the handler is still pending at the deadline', async () => {
    const { attempt, calls } = answers({ status: 'pending', retryAfterMs: 20 })

    const failure = settleCallout('svc', attempt, { maxWaitMs: 60 })

    await expect(failure).rejects.toBeInstanceOf(CalloutError)
    await expect(failure).rejects.toThrow(/still pending after 60 ms/)
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('does not wait past the deadline for a long retryAfterMs', async () => {
    const { attempt } = answers({ status: 'pending', retryAfterMs: 60_000 })
    const started = Date.now()

    await expect(settleCallout('svc', attempt, { maxWaitMs: 50 })).rejects.toThrow(/still pending/)

    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('passes an attempt that throws straight through', async () => {
    await expect(settleCallout('svc', failingAttempt)).rejects.toThrow('svc: down')
  })
})
