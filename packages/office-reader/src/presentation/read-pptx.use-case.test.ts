import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { Deck } from './deck.model'
import { readPptx } from './read-pptx.use-case'
import type { ReadPptxOptions } from './read-pptx.use-case'

const incentivi = join(__dirname, 'fixtures', 'incentivi.pptx')
const packages = join(__dirname, '..', 'ooxml-package', 'fixtures')
const dfe = join(__dirname, '..', '..', '..', '..', 'examples', 'dfe-college-accounts', 'management-accounts-model-march-2026.pptx')

function relationships (entries: string[][]): string {
  return `<Relationships>${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`
}

/** A one-slide deck whose chart is a chartEx part, framed the way PowerPoint writes it: a choice, and a picture as the fallback. */
function chartExDeck (): Uint8Array {
  const officeDocument = 'https://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const frame = '<mc:AlternateContent><mc:Choice Requires="cx1"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Chart"/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="12700" cy="12700"/></p:xfrm>' +
    '<a:graphic><a:graphicData uri="https://schemas.microsoft.com/office/drawing/2014/chartex"><cx:chart r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame></mc:Choice>' +
    '<mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="4" name="Chart"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/></p:blipFill></p:pic></mc:Fallback></mc:AlternateContent>'
  const chart = '<cx:chartSpace><cx:chartData><cx:data id="0"><cx:strDim type="cat"><cx:lvl ptCount="2"><cx:pt idx="0">Lead</cx:pt><cx:pt idx="1">Ordine</cx:pt></cx:lvl></cx:strDim>' +
    '<cx:numDim type="val"><cx:lvl ptCount="2"><cx:pt idx="0">100</cx:pt><cx:pt idx="1">40</cx:pt></cx:lvl></cx:numDim></cx:data></cx:chartData>' +
    '<cx:chart><cx:plotArea><cx:plotAreaRegion><cx:series layoutId="funnel"><cx:tx><cx:txData><cx:v>Nord</cx:v></cx:txData></cx:tx><cx:dataId val="0"/></cx:series></cx:plotAreaRegion></cx:plotArea></cx:chart></cx:chartSpace>'

  return zipSync({
    '_rels/.rels':                      strToU8(relationships([['rId1', `${officeDocument}/officeDocument`, 'ppt/presentation.xml']])),
    'ppt/presentation.xml':             strToU8('<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>'),
    'ppt/_rels/presentation.xml.rels':  strToU8(relationships([['rId1', `${officeDocument}/slide`, 'slides/slide1.xml']])),
    'ppt/slides/slide1.xml':            strToU8(`<p:sld><p:cSld><p:spTree>${frame}</p:spTree></p:cSld></p:sld>`),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(relationships([['rId2', 'https://schemas.microsoft.com/office/2014/relationships/chartEx', '../charts/chartEx1.xml'], ['rId3', `${officeDocument}/image`, '../media/image1.png']])),
    'ppt/charts/chartEx1.xml':          strToU8(chart),
  })
}

async function deck (options?: ReadPptxOptions): Promise<Deck> {
  return readPptx(incentivi, options)
}

async function slides (options?: ReadPptxOptions): Promise<Deck['slides']> {
  const read = await deck(options)

  return read.slides
}

async function slideNumbers (slides: ReadPptxOptions['slides']): Promise<number[]> {
  const read = await deck({ slides })

  return read.slides.map(slide => slide.number)
}

describe('readPptx', () => {
  it('reads slides in presentation order, with the slide size in points', async () => {
    const read = await deck()
    expect([read.width, read.height]).toEqual([960, 540])
    expect(read.slides.map(slide => [slide.number, slide.title, slide.hidden])).toEqual([[1, 'Incentivi giugno', false], [2, 'Griglia prezzi Jeep', false], [3, 'Vendite', false], [4, 'Bozza', true]])
  })

  it('places a title from its layout and a body from the master, and leaves slide numbers out', async () => {
    const [first, , third] = await slides()
    expect(first.shapes).toEqual([{ x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }])
    expect(third.shapes[1]).toEqual({ x: 60, y: 110, width: 840, height: 380, text: 'Fonte: UNRAE', placeholder: 'body' })
  })

  it('reads a native table as a sheet, merged cells as ranges', async () => {
    const [first] = await slides()
    expect(first.tables).toEqual([{
      name:       'table 1',
      hidden:     false,
      rows:       [['Incentivi giugno 2026', '', '', ''], ['Modello', 'Prezzo', '', 'Sconto'], ['', 'Listino', 'Netto', ''], ['Pandina', '15.950 €', '13.955 €', '12,5%'], ['Pandina Cross', '17.950 €', '15.706 €', '12,5%']],
      hiddenRows: [],
      merges:     ['A1:D1', 'A2:A3', 'B2:C2', 'D2:D3'],
    }])
    expect(first.notes).toBe('Prezzi IVA inclusa.\nValidi fino al 30 giugno.')
  })

  it('places grouped text boxes through the group\'s scaling, in reading order', async () => {
    const [, second] = await slides()
    expect(second.shapes.slice(1, 4).map(shape => [shape.x, shape.y, shape.width, shape.height, shape.text])).toEqual([[60, 120, 190, 25, 'Modello'], [260, 120, 190, 25, 'Prezzo'], [460, 120, 190, 25, 'Sconto']])
    expect(second.shapes.at(-1)).toMatchObject({ x: 460, y: 180, text: '10%' })
  })

  it('reads a chart from its cache: series, categories, missing points, the title but not an axis\'s', async () => {
    const chart = { type: 'bar', title: 'Immatricolazioni', series: [{ name: 'Pandina', categories: ['Aprile', 'Maggio', 'Giugno'], values: [1200, 1350.5, 1410] }, { name: '600e', categories: ['Aprile', 'Maggio', 'Giugno'], values: [300, null, 410] }] }
    const [typed] = await slides({ slides: [3] })
    expect(typed.charts).toEqual([chart])
    const asText = await readPptx(incentivi, { slides: [3], values: 'text' })
    expect(asText.slides[0].charts[0].series[1].values).toEqual(['300', '', '410'])
  })

  it('reads a chartEx chart (the 2016 types) by its relationship, once', async () => {
    const read = await readPptx(chartExDeck())
    expect(read.slides[0].charts).toEqual([{ type: 'funnel', series: [{ name: 'Nord', categories: ['Lead', 'Ordine'], values: [100, 40] }] }])
  })

  it('reads the DfE deck\'s waterfall, its title once', async () => {
    const read = await readPptx(dfe, { slides: [9] })
    const [chart] = read.slides[0].charts
    expect(chart).toMatchObject({ type: 'waterfall', title: 'Income and Expenditure Forecast Variance to Budget (£’000)' })
    expect(chart.series).toEqual([{
      name:       'Series1',
      categories: ['Budget', 'ASF', 'Apps', 'HE', 'Other income', 'Pay', 'Non pay', 'Other   ', 'Forecast'],
      values:     [-20, -139, -56, -92, -69, 216, -110, 8, -262],
    }])
    expect(read.slides[0].shapes.map(shape => shape.text)).toEqual(['Income and Expenditure Bridge'])
  })

  it('reads the slides asked for, and leaves notes and charts out when told to', async () => {
    expect(await slideNumbers([2, 4])).toEqual([2, 4])
    expect(await slideNumbers(/^(vendite|bozza)$/i)).toEqual([3, 4])
    expect(await slideNumbers(slide => !slide.hidden)).toEqual([1, 2, 3])
    const lean = await deck({ notes: false, charts: false })
    expect(lean.slides.map(slide => [slide.notes, slide.charts.length])).toEqual([['', 0], ['', 0], ['', 0], ['', 0]])
  })

  it('reads a Blob, and refuses what is not a presentation, saying what it is', async () => {
    const bytes = readFileSync(incentivi)
    const read = await readPptx(new Blob([bytes]), { slides: [1] })
    expect(read.slides[0].title).toBe('Incentivi giugno')
    const workbook = join(__dirname, '..', 'spreadsheet', 'fixtures', 'incentivi.xlsx')
    await expect(readPptx(workbook)).rejects.toMatchObject({ code: 'not-pptx', message: expect.stringMatching(/readXlsx/) })
    await expect(readPptx(join(packages, 'legacy.xls'))).rejects.toMatchObject({ code: 'legacy-format' })
  })
})
