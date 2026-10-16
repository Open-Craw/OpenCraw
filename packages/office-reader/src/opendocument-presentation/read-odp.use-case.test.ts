import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { readPptx } from '../presentation'
import { readOdp } from './read-odp.use-case'
import type { ReadOdpOptions } from './read-odp.use-case'

const NAMESPACES = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"'
const ODP_MIMETYPE = 'application/vnd.oasis.opendocument.presentation'

interface Parts {
  pages:    string
  styles?:  string
  layout?:  string
  objects?: Record<string, string>
}

/** An `.odp` as the apps write it: a stored `mimetype` first, then `content.xml`, `styles.xml` and chart folders. */
function odp ({ pages, styles = '', layout = '', objects = {} }: Parts): Uint8Array {
  const content = `<?xml version="1.0"?><office:document-content ${NAMESPACES}><office:automatic-styles>${styles}</office:automatic-styles><office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`
  const stylesXml = `<?xml version="1.0"?><office:document-styles ${NAMESPACES}><office:automatic-styles>${layout}</office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`
  const folders = Object.fromEntries(Object.entries(objects).map(([name, xml]) => [`${name}/content.xml`, strToU8(xml)]))

  return zipSync({ 'mimetype': [strToU8(ODP_MIMETYPE), { level: 0 }], 'content.xml': strToU8(content), 'styles.xml': strToU8(stylesXml), ...folders })
}

const p = (text: string): string => `<text:p>${text}</text:p>`
const name = (text: string): string => `<table:table-cell office:value-type="string"><text:p>${text}</text:p></table:table-cell>`
const frame = (geometry: string, content: string, klass = ''): string => `<draw:frame ${geometry}${klass === '' ? '' : ` presentation:class="${klass}"`}><draw:text-box>${content}</draw:text-box></draw:frame>`
const at = (x: number, y: number, width = 100, height = 20): string => `svg:x="${String(x)}pt" svg:y="${String(y)}pt" svg:width="${String(width)}pt" svg:height="${String(height)}pt"`
const page = (content: string, style = 'dp1'): string => `<draw:page draw:name="p" draw:style-name="${style}" draw:master-page-name="Default">${content}</draw:page>`

async function slidesOf (pages: string, options?: ReadOdpOptions, extra: Omit<Parts, 'pages'> = {}): Promise<Awaited<ReturnType<typeof readOdp>>['slides']> {
  const deck = await readOdp(odp({ pages, ...extra }), options)

  return deck.slides
}

describe('readOdp', () => {
  it('reads each slide\'s text boxes in points, in reading order, with the title and the placeholder', async () => {
    const title = frame(at(60, 30, 840, 60), p('Incentivi'), 'title')
    const lower = frame(at(60, 200), p('Second') + p('line'))
    const upper = frame(at(300, 100), p('Right'))
    const left = frame(at(60, 100), p('Left'), 'outline')
    const slides = await slidesOf(page(lower + upper + left + title))

    expect(slides).toEqual([{
      number: 1,
      title:  'Incentivi',
      hidden: false,
      shapes: [
        { x: 60, y: 30, width: 840, height: 60, text: 'Incentivi', placeholder: 'title' },
        { x: 60, y: 100, width: 100, height: 20, text: 'Left', placeholder: 'body' },
        { x: 300, y: 100, width: 100, height: 20, text: 'Right' },
        { x: 60, y: 200, width: 100, height: 20, text: 'Second\nline' },
      ],
      tables: [],
      charts: [],
      notes:  '',
    }])
  })

  it('reads the units a position is written in, and the slide size from the page layout', async () => {
    const box = frame('svg:x="2.54cm" svg:y="1in" svg:width="25.4mm" svg:height="36pt"', p('x'))
    const layout = '<style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm"/></style:page-layout>'
    const deck = await readOdp(odp({ pages: page(box), layout }))

    expect(deck.slides[0].shapes).toEqual([{ x: 72, y: 72, width: 72, height: 36, text: 'x' }])
    expect([deck.width, deck.height]).toEqual([793.7, 446.46])
  })

  it('reads text in a shape too, with its spaces, tabs and line breaks, and leaves out footers, dates and slide numbers', async () => {
    const shape = `<draw:custom-shape ${at(10, 10)}><text:p>a  <text:s text:c="2"/>b<text:tab/>c<text:line-break/>d</text:p></draw:custom-shape>`
    const furniture = frame(at(0, 500), p('Footer'), 'footer') + frame(at(0, 520), p('1'), 'page-number') + frame(at(0, 540), p('1 June'), 'date-time')
    const slides = await slidesOf(page(shape + furniture))

    expect(slides[0].shapes).toEqual([{ x: 10, y: 10, width: 100, height: 20, text: 'a    b\tc\nd' }])
  })

  it('reads a table as a sheet with merged cells as ranges, its text not a text box', async () => {
    const wide = '<table:table-cell table:number-columns-spanned="2"><text:p>Price</text:p></table:table-cell><table:covered-table-cell/>'
    const first = `<table:table-row>${wide}</table:table-row>`
    const second = '<table:table-row><table:table-cell><text:p>List</text:p></table:table-cell><table:table-cell><text:p>Net</text:p></table:table-cell></table:table-row>'
    const table = `<draw:frame ${at(60, 120, 840, 200)}><table:table table:name="T">${first}${second}</table:table></draw:frame>`
    const slides = await slidesOf(page(table))

    expect(slides[0].shapes).toEqual([])
    expect(slides[0].tables).toEqual([{ name: 'table 1', hidden: false, rows: [['Price', ''], ['List', 'Net']], hiddenRows: [], merges: ['A1:B1'] }])
  })

  it('reads the speaker notes, a hidden slide by its page style, and the slides asked for', async () => {
    const notes = `<presentation:notes><draw:page-thumbnail/>${frame(at(0, 400), p('Say this.') + p('Then that.'), 'notes')}</presentation:notes>`
    const styles = '<style:style style:name="dp9" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="hidden"/></style:style>'
    const pages = page(frame(at(0, 0), p('One'), 'title') + notes) + page(frame(at(0, 0), p('Two'), 'title'), 'dp9') + page(frame(at(0, 0), p('Three'), 'title'))
    const all = await slidesOf(pages, undefined, { styles })

    expect(all.map(slide => [slide.number, slide.title, slide.hidden, slide.notes])).toEqual([[1, 'One', false, 'Say this.\nThen that.'], [2, 'Two', true, ''], [3, 'Three', false, '']])
    const numbers = async (options: ReadOdpOptions): Promise<number[]> => {
      const chosen = await slidesOf(pages, options, { styles })

      return chosen.map(slide => slide.number)
    }
    const withoutNotes = await slidesOf(pages, { notes: false }, { styles })

    expect(await numbers({ slides: [3] })).toEqual([3])
    expect(await numbers({ slides: /^T/ })).toEqual([2, 3])
    expect(await numbers({ slides: slide => !slide.hidden })).toEqual([1, 3])
    expect(withoutNotes[0].notes).toBe('')
  })

  it('reads a chart from its data table: type, title once (not an axis\'s), series, categories and a missing point', async () => {
    const cells = (...values: (number | undefined)[]): string => values.map(value => (value === undefined ? '<table:table-cell/>' : `<table:table-cell office:value-type="float" office:value="${String(value)}"><text:p>${String(value)}</text:p></table:table-cell>`)).join('')
    const header = `<table:table-row><table:table-cell><text:p/></table:table-cell>${name('A')}${name('B')}</table:table-row>`
    const body = `<table:table-row>${name('Q1')}${cells(1, 10)}</table:table-row><table:table-row>${name('Q2')}${cells(2, undefined)}</table:table-row>`
    const chart = `<office:document-content ${NAMESPACES}><office:body><office:chart><chart:chart chart:class="chart:circle"><chart:title><text:p>Share</text:p></chart:title><chart:plot-area><chart:axis chart:dimension="x"><chart:title><text:p>Axis</text:p></chart:title></chart:axis></chart:plot-area><table:table table:name="local-table"><table:table-header-rows>${header}</table:table-header-rows><table:table-rows>${body}</table:table-rows></table:table></chart:chart></office:chart></office:body></office:document-content>`
    const pages = page('<draw:frame svg:x="0pt" svg:y="0pt" svg:width="10pt" svg:height="10pt"><draw:object xlink:href="./Object 1" xlink:type="simple"/></draw:frame>')
    const objects = { 'Object 1': chart }
    const typed = await slidesOf(pages, undefined, { objects })
    const text = await slidesOf(pages, { values: 'text' }, { objects })
    const none = await slidesOf(pages, { charts: false }, { objects })

    expect(typed[0].charts).toEqual([{ type: 'pie', title: 'Share', series: [{ name: 'A', categories: ['Q1', 'Q2'], values: [1, 2] }, { name: 'B', categories: ['Q1', 'Q2'], values: [10, null] }] }])
    expect(text[0].charts[0].series[1].values).toEqual(['10', ''])
    expect(none[0].charts).toEqual([])
  })

  it('skips an object that is not a chart, and comments', async () => {
    const formula = `<office:document-content ${NAMESPACES}><office:body><office:formula/></office:body></office:document-content>`
    const comment = '<office:annotation><text:p>private</text:p></office:annotation>'
    const object = '<draw:frame svg:x="0pt" svg:y="0pt" svg:width="10pt" svg:height="10pt"><draw:object xlink:href="./Object 2"/></draw:frame>'
    const visible = frame(at(0, 0), p('Visible') + comment)
    const objects = { 'Object 2': formula }
    const slides = await slidesOf(page(object + visible), undefined, { objects })

    expect(slides[0].charts).toEqual([])
    expect(slides[0].shapes.map(shape => shape.text)).toEqual(['Visible'])
  })

  it('refuses other files with the reason', async () => {
    const odt = zipSync({ 'mimetype': [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }], 'content.xml': strToU8('<x/>') })

    await expect(readOdp(odt)).rejects.toMatchObject({ code: 'unsupported-format' })
    await expect(readOdp(new TextEncoder().encode('plain'))).rejects.toMatchObject({ code: 'not-zip' })
  })
})

describe('readOdp on a deck also saved as .pptx', () => {
  it('gives the same slides, positions, tables, charts, notes and size as readPptx, in typed and text mode', async () => {
    const odpPath = join(__dirname, 'fixtures', 'incentivi.odp')
    const pptxPath = join(__dirname, '..', 'presentation', 'fixtures', 'incentivi.pptx')

    expect(await readOdp(odpPath)).toEqual(await readPptx(pptxPath))
    expect(await readOdp(odpPath, { values: 'text' })).toEqual(await readPptx(pptxPath, { values: 'text' }))
  })
})
