import { visibleBounds } from './window-bounds.algorithm'

const screen = { x: 0, y: 0, width: 1920, height: 1080 }
const saved = { x: 100, y: 80, width: 1200, height: 800, maximized: false }

describe('visibleBounds', () => {
  it('keeps bounds that sit on a connected screen', () => {
    expect(visibleBounds(saved, [screen])).toEqual(saved)
  })

  it('keeps bounds on a second screen that is still there', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 }

    expect(visibleBounds({ ...saved, x: 2100 }, [screen, second])).toBeDefined()
  })

  it('drops bounds whose screen was unplugged', () => {
    expect(visibleBounds({ ...saved, x: 2100 }, [screen])).toBeUndefined()
  })

  it('drops bounds that only graze a screen edge', () => {
    expect(visibleBounds({ ...saved, x: 1880 }, [screen])).toBeUndefined()
  })

  it('has nothing to restore when nothing was saved', () => {
    expect(visibleBounds(undefined, [screen])).toBeUndefined()
  })
})
