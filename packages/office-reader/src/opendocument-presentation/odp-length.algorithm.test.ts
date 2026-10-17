import { pointsOf } from './odp-length.algorithm'

describe('pointsOf', () => {
  it('converts the units a length is written in to points, to two decimals', () => {
    expect(pointsOf('28cm')).toBe(793.7)
    expect(pointsOf('15.75cm')).toBe(446.46)
    expect(pointsOf('10in')).toBe(720)
    expect(pointsOf('254mm')).toBe(720)
    expect(pointsOf('12pt')).toBe(12)
    expect(pointsOf('2pc')).toBe(24)
    expect(pointsOf('16px')).toBe(12)
    expect(pointsOf('-1.5cm')).toBe(-42.52)
    expect(pointsOf('36')).toBe(36)
    expect(pointsOf('.5in')).toBe(36)
  })

  it('says nothing for what is not a length', () => {
    expect(pointsOf(undefined)).toBeUndefined()
    expect(pointsOf('')).toBeUndefined()
    expect(pointsOf('wide')).toBeUndefined()
    expect(pointsOf('3furlongs')).toBeUndefined()
    expect(pointsOf('50%')).toBeUndefined()
  })
})
