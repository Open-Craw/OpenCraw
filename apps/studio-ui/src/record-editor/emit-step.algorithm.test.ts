import { hasEmitStep, withEmitStep } from './emit-step.algorithm'

describe('hasEmitStep', () => {
  it('is false for steps that only read values', () => {
    expect(hasEmitStep([{ type: 'request', id: 'doc' }, { type: 'extract', id: 'a' }])).toBe(false)
  })

  it('is true for a top-level emit', () => {
    expect(hasEmitStep([{ type: 'request' }, { type: 'emit' }])).toBe(true)
  })

  it('finds an emit nested in a loop', () => {
    expect(hasEmitStep([{ type: 'foreach', steps: [{ type: 'emit' }] }])).toBe(true)
  })

  it('is false for no steps at all', () => {
    expect(hasEmitStep(undefined)).toBe(false)
  })
})

describe('withEmitStep', () => {
  it('appends an emit and leaves the steps it had', () => {
    expect(withEmitStep([{ type: 'request' }])).toEqual([{ type: 'request' }, { type: 'emit' }])
  })

  it('makes a list of one from no steps', () => {
    expect(withEmitStep(undefined)).toEqual([{ type: 'emit' }])
  })
})
