import { capWindows } from './windows-cap.policy'

describe('capWindows', () => {
  it('keeps a policy within the host limit and the job size', () => {
    expect(capWindows({ min: 2, max: 20, start: 10, grow: { after: 3 } }, 8)).toEqual({ min: 2, max: 8, start: 8, grow: { after: 3 } })
    expect(capWindows({ min: 2, max: 20 }, 8, 3)).toEqual({ min: 2, max: 3, start: 2 })
    expect(capWindows({ min: 5, max: 6 }, 8, 2)).toEqual({ min: 2, max: 2, start: 2 })
  })

  it('reads a number as a fixed pool', () => {
    expect(capWindows(4, 8)).toEqual({ min: 4, max: 4, start: 4 })
    expect(capWindows(12, 8)).toEqual({ min: 8, max: 8, start: 8 })
  })
})
