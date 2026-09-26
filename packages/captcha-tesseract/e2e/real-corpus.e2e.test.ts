import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tesseractReader } from '../src/index'
import type { TesseractReaderOptions } from '../src/index'

interface Labelled { file: string, code: string | null, clipped?: boolean }

const CORPUS = join(__dirname, 'corpus', 'vahan')
const { charset, images } = JSON.parse(readFileSync(join(CORPUS, 'labels.json'), 'utf8')) as { charset: string, images: Labelled[] }

/** Reads the whole corpus: how many reads were submitted right, submitted wrong, or refused (refreshed, never submitted). */
async function measure (options: TesseractReaderOptions): Promise<{ right: number, refused: number, wrong: string[] }> {
  const reader = tesseractReader({ length: 6, caseSensitive: true, ...options })
  const tally = { right: 0, refused: 0, wrong: [] as string[] }
  try {
    for (const image of images) {
      const read = await reader.read(readFileSync(join(CORPUS, image.file)))
      if (read.problem !== undefined) tally.refused += 1
      else if (read.text === image.code) tally.right += 1
      else tally.wrong.push(`${image.file}: ${image.code ?? '?'} read ${read.text}`)
    }
  } finally {
    await reader.close()
  }

  return tally
}

// 100 real captchas from the public Vahan report, labelled by hand (e2e/corpus/vahan). Measured when collected:
//   the site's charset, cross-check on (the defaults otherwise): 73 right, 26 refused, 1 wrong (a clipped image);
//   the site's charset, cross-check off:                         78 right, 16 refused, 6 wrong;
//   A-Za-z0-9, cross-check off:                                  71 right, 17 refused, 12 wrong.
// A wrong read costs a form post and a page load; a refused one a free refresh. The floors leave room for
// Tesseract's run-to-run noise; a change that makes the reader worse on real images fails here.
describe('tesseract reader on real captchas', () => {
  it('submits almost no wrong read with the site\'s charset and the cross-check', async () => {
    const tally = await measure({ charset })
    expect(tally.right).toBeGreaterThanOrEqual(65)
    expect(tally.wrong.length).toBeLessThanOrEqual(3)
  }, 120_000)

  it('submits more wrong reads without the cross-check', async () => {
    const tally = await measure({ charset, crossCheck: false })
    expect(tally.right).toBeGreaterThanOrEqual(70)
    expect(tally.wrong.length).toBeGreaterThan(3)
  }, 120_000)
})
