import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inlineLocalImages } from './inline-local-images.use-case'

const PNG = Buffer.from('iVBORw0KGgo=', 'base64')

function workspace (): { folder: string, documentUrl: string } {
  const folder = mkdtempSync(join(tmpdir(), 'inline-images-'))
  mkdirSync(join(folder, 'img'))
  writeFileSync(join(folder, 'img', 'logo.png'), PNG)
  writeFileSync(join(folder, 'top.png'), PNG)

  return { folder, documentUrl: pathToFileURL(join(folder, 'readme.md')).href }
}

describe('inlineLocalImages', () => {
  it('embeds the pictures that sit beside the file or below it', async () => {
    const { documentUrl } = workspace()

    const result = await inlineLocalImages('<p><img src="img/logo.png" alt="logo"><img src="./top.png"></p>', documentUrl)

    expect(result.inlined).toBe(2)
    expect(result.missing).toBe(0)
    expect(result.html).toContain(`data:image/png;base64,${PNG.toString('base64')}`)
  })

  it('counts a picture that is not there, and leaves it as it was', async () => {
    const { documentUrl } = workspace()

    const result = await inlineLocalImages('<img src="img/gone.png">', documentUrl)

    expect(result).toMatchObject({ inlined: 0, missing: 1 })
    expect(result.html).toContain('img/gone.png')
  })

  it('never reads a file outside the document\'s own folder', async () => {
    const { documentUrl } = workspace()

    const result = await inlineLocalImages('<img src="../../../etc/passwd.png"><img src="file:///C:/Windows/win.png">', documentUrl)

    expect(result).toMatchObject({ inlined: 0, missing: 2 })
  })

  it('leaves a picture on a website and a page that is not a file alone', async () => {
    const { documentUrl } = workspace()

    expect(await inlineLocalImages('<img src="https://example.com/a.png">', documentUrl)).toMatchObject({ inlined: 0, missing: 0 })
    expect(await inlineLocalImages('<img src="a.png">', 'https://example.com/page')).toMatchObject({ inlined: 0, missing: 0 })
  })
})
