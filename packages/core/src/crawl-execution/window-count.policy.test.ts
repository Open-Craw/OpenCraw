import { resolveWindowsPolicy, WindowCount } from './window-count.policy'

describe('resolveWindowsPolicy', () => {
  it('reads a number as a fixed pool, fills the defaults, and refuses bounds that cannot hold', () => {
    expect(resolveWindowsPolicy(4)).toEqual({ min: 4, max: 4, start: 4, growAfter: 10, shrink: 'half' })
    expect(resolveWindowsPolicy({ min: 5, max: 20, start: 12, grow: { after: 3 }, shrink: 'one', restart: { after: 20 } })).toEqual({ min: 5, max: 20, start: 12, growAfter: 3, shrink: 'one', restartAfter: 20 })
    expect(() => resolveWindowsPolicy({ min: 0 })).toThrow('windows.min')
    expect(() => resolveWindowsPolicy({ min: 3, max: 2 })).toThrow('windows.max')
    expect(() => resolveWindowsPolicy({ min: 2, max: 4, start: 5 })).toThrow('windows.start')
  })
})

describe('WindowCount', () => {
  it('grows by one after a run of successes, up to max', () => {
    const count = new WindowCount(resolveWindowsPolicy({ min: 1, max: 3, grow: { after: 2 } }))
    expect(count.record('success', 0)).toBeUndefined()
    expect(count.record('success', 0)).toMatchObject({ kind: 'grow', from: 1, to: 2 })
    count.record('success', 0)
    expect(count.record('success', 0)).toMatchObject({ kind: 'grow', to: 3 })
    count.record('success', 0)
    expect(count.record('success', 0)).toBeUndefined()
    expect(count.target).toBe(3)
  })

  it('halves on a failure, but items already in flight at a shrink do not shrink it again', () => {
    const count = new WindowCount(resolveWindowsPolicy({ min: 1, max: 16, start: 16 }))
    const inFlight = count.generation
    expect(count.record('failure', inFlight)).toMatchObject({ kind: 'shrink', from: 16, to: 8 })
    // The other 15 items that were running when the site hiccupped fail too: no cascade.
    for (let failure = 0; failure < 15; failure += 1) expect(count.record('failure', inFlight)).toBeUndefined()
    expect(count.target).toBe(8)
    // An item started after the shrink that fails does shrink it.
    expect(count.record('failure', count.generation)).toMatchObject({ kind: 'shrink', from: 8, to: 4 })
  })

  it('shrinks one by one when asked, never under min, and ignores neutral outcomes', () => {
    const count = new WindowCount(resolveWindowsPolicy({ min: 2, max: 5, start: 3, shrink: 'one' }))
    expect(count.record('neutral', 0)).toBeUndefined()
    expect(count.record('failure', count.generation)).toMatchObject({ from: 3, to: 2 })
    expect(count.record('failure', count.generation)).toBeUndefined()
    expect(count.target).toBe(2)
  })

  it('asks for a restart after failures in a row, back at min; a success breaks the run', () => {
    const count = new WindowCount(resolveWindowsPolicy({ min: 2, max: 10, start: 10, restart: { after: 3 } }))
    count.record('failure', 0)
    count.record('failure', 0)
    count.record('success', count.generation)
    count.record('failure', count.generation)
    count.record('failure', count.generation)
    expect(count.record('failure', count.generation)).toMatchObject({ kind: 'restart', to: 2 })
    expect(count.target).toBe(2)
  })

  it('lets an idle window go: one fewer than are running, never under min, and no failure counted', () => {
    const count = new WindowCount(resolveWindowsPolicy({ min: 1, max: 4, start: 3, idle: { afterMs: 500 } }))
    const generation = count.generation
    expect(count.idleAfterMs).toBe(500)
    expect(count.idle(3)).toEqual({ kind: 'shrink', from: 3, to: 2, reason: 'idle for 500 ms' })
    // Already aiming lower than the windows running: the idle one just leaves.
    expect(count.idle(3)).toBeUndefined()
    expect(count.idle(2)).toMatchObject({ from: 2, to: 1 })
    expect(count.idle(1)).toBeUndefined()
    expect(count.target).toBe(1)
    expect(count.generation).toBe(generation)
  })

  it('refuses an idle wait that is not a positive number', () => {
    expect(() => resolveWindowsPolicy({ idle: { afterMs: 0 } })).toThrow('windows.idle.afterMs')
  })
})
