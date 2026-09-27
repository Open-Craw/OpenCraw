import { readChartEx } from './chart-ex.mapper'

const space = (data: string, chart: string): string => '<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
  `<cx:chartData>${data}</cx:chartData><cx:chart>${chart}</cx:chart></cx:chartSpace>`
const points = (values: (string | null)[]): string => values.map((value, index) => (value === null ? '' : `<cx:pt idx="${index}">${value}</cx:pt>`)).join('')
const strDim = (type: string, ...levels: string[][]): string => `<cx:strDim type="${type}"><cx:f>Sheet1!$A$2:$A$4</cx:f>${levels.map(level => `<cx:lvl ptCount="${level.length}">${points(level)}</cx:lvl>`).join('')}</cx:strDim>`
const numDim = (type: string, values: (string | null)[]): string => `<cx:numDim type="${type}"><cx:f>Sheet1!$B$2:$B$4</cx:f><cx:lvl ptCount="${values.length}" formatCode="General">${points(values)}</cx:lvl></cx:numDim>`
const series = (layout: string, name: string, dataId: string): string => `<cx:series layoutId="${layout}"><cx:tx><cx:txData><cx:f>Sheet1!$B$1</cx:f><cx:v>${name}</cx:v></cx:txData></cx:tx><cx:dataId val="${dataId}"/></cx:series>`
const plot = (content: string): string => `<cx:plotArea><cx:plotAreaRegion>${content}</cx:plotAreaRegion><cx:axis id="0"><cx:title><cx:tx><cx:txData><cx:v>Asse</cx:v></cx:txData></cx:tx></cx:title></cx:axis></cx:plotArea>`

describe('readChartEx', () => {
  it('reads a waterfall: its layout as the type, the title once (text and its rich copy), series from the cached data', () => {
    const title = '<cx:title><cx:tx><cx:txData><cx:v>Varianza (£’000)</cx:v></cx:txData></cx:tx><cx:txPr><a:bodyPr/><a:p><a:r><a:t>Varianza (£’000)</a:t></a:r></a:p></cx:txPr></cx:title>'
    const xml = space(`<cx:data id="0">${strDim('cat', ['Budget', 'Pay', 'Forecast'])}${numDim('val', ['-20', '216', '-262'])}</cx:data>`, title + plot(series('waterfall', 'Series1', '0')))
    expect(readChartEx(xml, 'typed')).toEqual({ type: 'waterfall', title: 'Varianza (£’000)', series: [{ name: 'Series1', categories: ['Budget', 'Pay', 'Forecast'], values: [-20, 216, -262] }] })
  })

  it('reads a title held only in rich text, and each series from its own data block', () => {
    const title = '<cx:title><cx:tx><cx:rich><a:bodyPr/><a:p><a:r><a:t>Funnel </a:t></a:r><a:r><a:t>vendite</a:t></a:r></a:p></cx:rich></cx:tx></cx:title>'
    const data = `<cx:data id="0">${strDim('cat', ['Lead', 'Ordine'])}${numDim('val', ['100', '40'])}</cx:data><cx:data id="1">${strDim('cat', ['Lead', 'Ordine'])}${numDim('val', ['90', null])}</cx:data>`
    const region = series('funnel', 'Nord', '0') + series('funnel', 'Sud', '1')
    const chart = readChartEx(space(data, title + plot(region)), 'text')
    expect(chart).toEqual({
      type:   'funnel',
      title:  'Funnel vendite',
      series: [{ name: 'Nord', categories: ['Lead', 'Ordine'], values: ['100', '40'] }, { name: 'Sud', categories: ['Lead', 'Ordine'], values: ['90', ''] }],
    })
  })

  it('reads a hierarchy\'s leaves as categories, and a histogram without categories', () => {
    const treemap = space(`<cx:data id="0">${strDim('cat', ['Pandina', '600e', 'Avenger'], ['Fiat', 'Fiat', 'Jeep'])}${numDim('size', ['10', '4', '6'])}</cx:data>`, plot(series('treemap', 'Vendite', '0')))
    expect(readChartEx(treemap, 'typed')).toEqual({ type: 'treemap', series: [{ name: 'Vendite', categories: ['Pandina', '600e', 'Avenger'], values: [10, 4, 6] }] })
    const histogram = space(`<cx:data id="0">${numDim('val', ['1.5', '2', null, '7'])}</cx:data>`, plot(series('clusteredColumn', 'Prezzi', '0')))
    expect(readChartEx(histogram, 'typed')).toEqual({ type: 'clusteredColumn', series: [{ name: 'Prezzi', categories: [], values: [1.5, 2, null, 7] }] })
  })

  it('reads a region map\'s regions and colour values', () => {
    const xml = space(`<cx:data id="0">${strDim('entityId', ['Italia', 'Francia'])}${numDim('colorVal', ['12', '8'])}</cx:data>`, plot(series('regionMap', 'Quota', '0')))
    expect(readChartEx(xml, 'typed').series).toEqual([{ name: 'Quota', categories: ['Italia', 'Francia'], values: [12, 8] }])
  })
})
