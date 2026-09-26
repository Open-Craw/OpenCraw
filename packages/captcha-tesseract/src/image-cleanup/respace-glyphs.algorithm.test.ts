import { PNG } from 'pngjs'
import { respaceGlyphs } from './respace-glyphs.algorithm'

/** A black-and-white PNG from rows of `#` (ink) and `.` (white). */
function png (rows: string[]): Buffer {
  const image = new PNG({ width: rows[0].length, height: rows.length })
  image.data.fill(255)
  for (const [y, row] of rows.entries()) {
    for (const [x, cell] of [...row].entries()) {
      if (cell === '#') image.data.fill(0, ((y * row.length) + x) * 4, (((y * row.length) + x) * 4) + 3)
    }
  }

  return PNG.sync.write(image)
}

function rowsOf (buffer: Buffer): string[] {
  const image = PNG.sync.read(buffer)

  return Array.from({ length: image.height }, (_, y) => Array.from({ length: image.width }, (_, x) => (image.data[((y * image.width) + x) * 4] === 0 ? '#' : '.')).join(''))
}

describe('respaceGlyphs', () => {
  it('lays each run of inked columns out again with the same gap around every one', () => {
    const image = png(['...#.##....#', '..##..#.....'])
    expect(rowsOf(respaceGlyphs(image, 2))).toEqual([
      '...#..##..#..',
      '..##...#.....',
    ])
  })

  it('keeps characters that touch together, and gives a blank image just its margin', () => {
    const touching = png(['.##.', '..#.'])
    const blank = png(['...', '...'])
    expect(rowsOf(respaceGlyphs(touching, 1))).toEqual(['.##.', '..#.'])
    expect(rowsOf(respaceGlyphs(blank, 3))).toEqual(['...', '...'])
  })
})
