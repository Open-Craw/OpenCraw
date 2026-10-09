import { httpHook } from '@opencraw/core'
import type { Hook, HookContext } from '@opencraw/core'
import { calloutHooks } from './callout-hooks.use-case'

const context: HookContext = { recipeId: 'r', scope: {}, log: () => undefined }

const local: Hook = input => `local:${String(input)}`

describe('calloutHooks', () => {
  it('leaves a hook that runs in the process as it is', async () => {
    const lines: string[] = []

    const hooks = calloutHooks({ local }, undefined, (line) => { lines.push(line) })

    expect(await hooks?.local?.('x', {}, context)).toBe('local:x')
    expect(hooks?.local).toBe(local)
    expect(lines).toEqual([])
  })

  it('says, once per call, that a hook calls outside the process, then calls it', async () => {
    const remote = httpHook('price', 'http://127.0.0.1:1/price', { timeoutMs: 200, maxWaitMs: 1 })
    const lines: string[] = []

    const hooks = calloutHooks({ price: remote }, undefined, (line) => { lines.push(line) })
    await expect(hooks?.price?.('x', {}, context)).rejects.toThrow()

    expect(lines).toEqual(['☎ hook "price" calls POST http://127.0.0.1:1/price (slow, and it may cost: stub it to skip the call)'])
  })

  it('answers a stubbed hook with the stub and never calls the hook', async () => {
    const remote = httpHook('price', 'http://127.0.0.1:1/price', { timeoutMs: 200 })
    const lines: string[] = []

    const hooks = calloutHooks({ price: remote }, { price: { amount: 9 } }, (line) => { lines.push(line) })

    expect(await hooks?.price?.('x', {}, context)).toEqual({ amount: 9 })
    expect(lines).toEqual(['☎ hook "price" is stubbed: answering {"amount":9} without calling it'])
  })

  it('ignores a stub for a name that is not a hook, and does nothing without hooks', () => {
    expect(Object.keys(calloutHooks({ a: () => 1 }, { nope: 1 }, () => undefined) ?? {})).toEqual(['a'])
    expect(calloutHooks(undefined, { a: 1 }, () => undefined)).toBeUndefined()
  })
})
