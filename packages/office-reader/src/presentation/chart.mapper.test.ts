import { readChart } from './chart.mapper'

describe('readChart', () => {
  it('reads a scatter chart\'s x values as categories, a literal series name, and cached points past the last one written', () => {
    const xml = '<c:chartSpace><c:chart><c:plotArea><c:scatterChart><c:ser><c:tx><c:v>Prezzo</c:v></c:tx>' +
      '<c:xVal><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numLit></c:xVal>' +
      '<c:yVal><c:numLit><c:ptCount val="3"/><c:pt idx="0"><c:v>10.5</c:v></c:pt></c:numLit></c:yVal></c:ser></c:scatterChart></c:plotArea></c:chart></c:chartSpace>'
    expect(readChart(xml, 'typed')).toEqual({ type: 'scatter', series: [{ name: 'Prezzo', categories: ['1', '2'], values: [10.5, null, null] }] })
  })

  it('reads a title\'s rich text runs once, and not an axis title', () => {
    const xml = '<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Vendite </a:t></a:r><a:r><a:rPr b="1"/><a:t>giugno</a:t></a:r></a:p><a:p><a:r><a:t>(unità)</a:t></a:r></a:p></c:rich></c:tx>' +
      '<c:txPr><a:bodyPr/><a:p><a:pPr><a:defRPr/></a:pPr><a:endParaRPr/></a:p></c:txPr></c:title>' +
      '<c:plotArea><c:barChart/><c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>Unità</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx></c:plotArea></c:chart></c:chartSpace>'
    expect(readChart(xml, 'typed')).toEqual({ type: 'bar', title: 'Vendite giugno\n(unità)', series: [] })
  })

  it('reads a title linked to a cell from its cached text, never the reference', () => {
    const xml = '<c:chartSpace><c:chart><c:title><c:tx><c:strRef><c:f>Foglio1!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Immatricolazioni</c:v></c:pt></c:strCache></c:strRef></c:tx></c:title>' +
      '<c:plotArea><c:lineChart/></c:plotArea></c:chart></c:chartSpace>'
    expect(readChart(xml, 'typed')).toEqual({ type: 'line', title: 'Immatricolazioni', series: [] })
  })

  it('leaves an automatic title (no text of its own) out', () => {
    const xml = '<c:chartSpace><c:chart><c:title><c:overlay val="0"/></c:title><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>'
    expect(readChart(xml, 'typed')).toEqual({ type: 'pie', series: [] })
  })
})
