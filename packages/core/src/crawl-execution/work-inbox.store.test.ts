import type { OutputRecord } from '../output-mapping'
import type { RecipeReport } from './crawl-report.model'
import { createWorkInbox } from './work-inbox.store'
import type { WorkItem } from './work-item.contract'

const item = (id: string): WorkItem => ({ id, vars: { q: id } })
const report = (id: string, error?: string): RecipeReport => ({ recipeId: 'r', item: id, mode: 'api', emitted: 1, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 0, pages: 1, durationMs: 1, ...(error !== undefined && { error }) })
const record = (id: string): OutputRecord => ({ key: id, data: { row: id }, source: { recipeId: 'r', url: 'u', emittedAt: 't', item: id } })

describe('createWorkInbox', () => {
  it('hands a submitted item to a waiting window and gives the submitter that item\'s result', async () => {
    const inbox = createWorkInbox()
    const taking = inbox.source.next()
    expect(inbox.idle).toBe(1)
    const result = inbox.submit(item('a'))
    const taken = await taking
    expect(taken).toMatchObject({ id: 'a' })
    expect(inbox.running).toBe(1)
    await inbox.source.done?.(item('a'), report('a'), [record('a')])
    await expect(result).resolves.toEqual({ outcome: 'success', report: report('a'), records: [record('a')] })
    expect(inbox.running).toBe(0)
  })

  it('serves items first come, first served, and the window that waited least first, each submitter getting its own result', async () => {
    const inbox = createWorkInbox()
    const longest = inbox.source.next()
    const latest = inbox.source.next()
    const results = ['a', 'b', 'c'].map(id => inbox.submit(item(id)))
    await expect(latest).resolves.toMatchObject({ id: 'a' })
    await expect(longest).resolves.toMatchObject({ id: 'b' })
    expect(inbox.queued).toBe(1)
    await expect(inbox.source.next()).resolves.toMatchObject({ id: 'c' })
    await inbox.source.failed?.(item('b'), report('b', 'boom'), 'failure')
    await inbox.source.done?.(item('c'), report('c'), [])
    await inbox.source.failed?.(item('a'), report('a', 'captcha'), 'neutral')
    const [a, b, c] = await Promise.all(results)
    expect([a.outcome, b.outcome, c.outcome]).toEqual(['neutral', 'failure', 'success'])
    expect(b.report.error).toBe('boom')
  })

  it('runs an id once while it is queued or running, and again once it has ended', async () => {
    const inbox = createWorkInbox()
    const once = inbox.submit(item('a'))
    const twice = inbox.submit(item('a'))
    expect(inbox.queued).toBe(1)
    await inbox.source.next()
    await inbox.source.done?.(item('a'), report('a'), [])
    expect(await twice).toBe(await once)
    void inbox.submit(item('a'))
    expect(inbox.queued).toBe(1)
  })

  it('after close, refuses new items, lets queued ones run, then runs dry', async () => {
    const inbox = createWorkInbox()
    const queued = inbox.submit(item('a'))
    inbox.close()
    await expect(inbox.submit(item('b'))).rejects.toThrow('the inbox is closed')
    await expect(inbox.source.next()).resolves.toMatchObject({ id: 'a' })
    await expect(inbox.source.next()).resolves.toBeUndefined()
    await inbox.source.done?.(item('a'), report('a'), [])
    await expect(queued).resolves.toMatchObject({ outcome: 'success' })
  })

  it('wakes waiting windows with nothing when it closes', async () => {
    const inbox = createWorkInbox()
    const waiting = [inbox.source.next(), inbox.source.next()]
    inbox.close()
    expect(await Promise.all(waiting)).toEqual([undefined, undefined])
    expect(inbox.idle).toBe(0)
  })

  it('takes a queued item back when its signal aborts, but never a running one', async () => {
    const inbox = createWorkInbox()
    const queuedControl = new AbortController()
    const runningControl = new AbortController()
    const running = inbox.submit(item('a'), { signal: runningControl.signal })
    const queued = inbox.submit(item('b'), { signal: queuedControl.signal })
    await inbox.source.next()
    runningControl.abort()
    queuedControl.abort(new Error('caller gave up'))
    await expect(queued).rejects.toThrow('caller gave up')
    expect(inbox.queued).toBe(0)
    await inbox.source.done?.(item('a'), report('a'), [])
    await expect(running).resolves.toMatchObject({ outcome: 'success' })
    const aborted = new AbortController()
    aborted.abort(new Error('already'))
    await expect(inbox.submit(item('c'), { signal: aborted.signal })).rejects.toThrow('already')
  })

  it('rejects everything unfinished on abort, and ignores the pool reporting on it afterwards', async () => {
    const inbox = createWorkInbox()
    const running = inbox.submit(item('a'))
    const queued = inbox.submit(item('b'))
    await inbox.source.next()
    inbox.abort(new Error('work failed'))
    await expect(running).rejects.toThrow('work failed')
    await expect(queued).rejects.toThrow('work failed')
    await inbox.source.done?.(item('a'), report('a'), [])
    expect(inbox.running).toBe(0)
    expect(await inbox.source.next()).toBeUndefined()
  })

  it('takes a waiting window off the list when its wait is aborted, so no item goes to it', async () => {
    const inbox = createWorkInbox()
    const control = new AbortController()
    const retiring = inbox.source.next({ signal: control.signal })
    const staying = inbox.source.next()
    control.abort(new Error('retired'))
    await expect(retiring).rejects.toThrow('retired')
    expect(inbox.idle).toBe(1)
    void inbox.submit(item('a'))
    await expect(staying).resolves.toMatchObject({ id: 'a' })
  })
})
