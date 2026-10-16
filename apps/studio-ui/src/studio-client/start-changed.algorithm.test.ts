import { startChanged } from './start-changed.algorithm'

describe('startChanged', () => {
  const before = JSON.stringify({ start: [{ url: 'file:///a.pdf' }], steps: [] })

  it('is false when only the steps changed', () => {
    expect(startChanged(before, { start: [{ url: 'file:///a.pdf' }], steps: [{ type: 'emit' }] })).toBe(false)
  })

  it('is true when the start points elsewhere', () => {
    expect(startChanged(before, { start: [{ url: 'file:///b.pdf' }], steps: [] })).toBe(true)
  })

  it('is true when it cannot tell', () => {
    expect(startChanged(undefined, { start: [] })).toBe(true)
    expect(startChanged('not json', { start: [] })).toBe(true)
  })
})
