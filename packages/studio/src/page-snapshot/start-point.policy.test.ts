import { startPointChanged } from './start-point.policy'

const base = { kind: 'input', id: 'r', output: 'o', mode: 'web', start: [{ url: 'https://a.test/' }], steps: [{ type: 'goto', url: '{{start.url}}' }], mapping: {} }

describe('startPointChanged', () => {
  it('is false for an edit that only adds steps or mapping (a pick)', () => {
    expect(startPointChanged(base, { ...base, steps: [...base.steps, { type: 'extract', id: 'v', selector: 'h1', kind: 'css' }], mapping: { name: { from: 'v' } } })).toBe(false)
  })

  it('is false when only the key order differs', () => {
    expect(startPointChanged(base, { id: 'r', kind: 'input', start: base.start, mode: 'web', output: 'o', mapping: {}, steps: [] })).toBe(false)
  })

  it('is true when the mode, the start or the session changes', () => {
    expect(startPointChanged(base, { ...base, mode: 'api' })).toBe(true)
    expect(startPointChanged(base, { ...base, start: [{ url: 'https://b.test/' }] })).toBe(true)
    expect(startPointChanged(base, { ...base, session: { bootstrap: { steps: [] } } })).toBe(true)
  })

  it('is true for a recipe with nothing saved before', () => {
    expect(startPointChanged(undefined, base)).toBe(true)
  })
})
