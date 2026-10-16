import { sparseRows, wantedWindows } from './windowed-rows.algorithm'

describe('wantedWindows', () => {
  it('keeps the windows on screen and one each side', () => {
    expect(wantedWindows(450, 480, 200, 2000)).toEqual([1, 2, 3])
  })

  it('does not reach before the first window or past the last', () => {
    expect(wantedWindows(0, 10, 200, 2000)).toEqual([0, 1])
    expect(wantedWindows(1990, 1999, 200, 2000)).toEqual([8, 9])
  })

  it('holds every window a tall screen spans', () => {
    expect(wantedWindows(150, 420, 200, 2000)).toEqual([0, 1, 2, 3])
  })

  it('holds the only window of a short sheet', () => {
    expect(wantedWindows(0, 5, 200, 50)).toEqual([0])
  })
})

describe('sparseRows', () => {
  it('is as long as the sheet, with only the loaded windows filled in', () => {
    const rows = sparseRows(10, 4, new Map([[0, ['a', 'b', 'c', 'd']], [2, ['i', 'j']]]))

    expect(rows).toHaveLength(10)
    expect(rows[0]).toBe('a')
    expect(rows[9]).toBe('j')
    expect(4 in rows).toBe(false)
  })

  it('is walked by map over the loaded rows only', () => {
    const rows = sparseRows<string>(6, 3, new Map([[1, ['x', 'y', 'z']]]))

    expect(rows.map(row => row.toUpperCase()).filter(Boolean)).toEqual(['X', 'Y', 'Z'])
  })

  it('ignores rows past the end of the sheet', () => {
    expect(sparseRows(5, 4, new Map([[1, ['e', 'f', 'g']]]))).toHaveLength(5)
  })
})
