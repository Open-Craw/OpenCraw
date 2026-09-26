import type { CrawlEvent } from './crawl-event.contract'
import { EventBus } from './event-bus.store'

describe('EventBus', () => {
  it('stamps events and delivers them to every listener', () => {
    const seen: CrawlEvent[] = []
    const bus = new EventBus((event) => { seen.push(event) })
    bus.subscribe((event) => { seen.push(event) })
    bus.emit({ type: 'page:visit', recipeId: 'r', url: 'http://x', number: 1 })
    expect(seen).toHaveLength(2)
    expect(seen[0].type).toBe('page:visit')
    expect(Date.parse(seen[0].at)).not.toBeNaN()
  })

  it('stamps what a scoped bus emits, which its own listeners and the parent hear; the parent\'s own events stay unstamped', () => {
    const parent: CrawlEvent[] = []
    const child: CrawlEvent[] = []
    const bus = new EventBus((event) => { parent.push(event) })
    let item: string | undefined = 'DL-1'
    const scoped = bus.scoped(() => ({ window: 2, item }))
    scoped.subscribe((event) => { child.push(event) })
    scoped.emit({ type: 'warning', recipeId: 'r', message: 'm' })
    item = undefined
    scoped.emit({ type: 'warning', recipeId: 'r', message: 'n' })
    bus.emit({ type: 'warning', recipeId: 'r', message: 'o' })
    expect(parent.map(event => [event.window, event.item])).toEqual([[2, 'DL-1'], [2, undefined], [undefined, undefined]])
    expect(child).toHaveLength(2)
    expect('item' in parent[1]).toBe(false)
  })

  it('unsubscribes and survives a throwing listener', () => {
    const seen: string[] = []
    const bus = new EventBus()
    bus.subscribe(() => { throw new Error('boom') })
    const off = bus.subscribe((event) => { seen.push(event.type) })
    bus.emit({ type: 'warning', recipeId: 'r', message: 'm' })
    off()
    bus.emit({ type: 'warning', recipeId: 'r', message: 'm' })
    expect(seen).toEqual(['warning'])
  })
})
