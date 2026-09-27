import { crawlIdSchema, itemRequestSchema } from './item-request.validator'

describe('itemRequestSchema', () => {
  it('takes a recipe version, an item, and the optional job size and windows', () => {
    const parsed = itemRequestSchema.parse({ recipe: { name: 'report', version: '3' }, item: { id: 'DL-1', vars: { state: 'DL', year: 2026, all: true } }, jobSize: 40, windows: { min: 1, max: 6, idle: { afterMs: 30_000 } } })
    expect(parsed.item.vars).toEqual({ state: 'DL', year: 2026, all: true })
  })

  it('refuses ids that would break an instance id or a blob name, and unknown fields', () => {
    expect(crawlIdSchema.safeParse('a/b').success).toBe(false)
    expect(crawlIdSchema.safeParse('x'.repeat(65)).success).toBe(false)
    expect(itemRequestSchema.safeParse({ recipe: { name: 'r', version: '1' }, item: { id: 'a#b', vars: {} } }).success).toBe(false)
    expect(itemRequestSchema.safeParse({ recipe: { name: 'r', version: '1' }, item: { id: 'a', vars: {} }, hooks: 'x' }).success).toBe(false)
  })
})
