import { walkXml } from '../ooxml-package'
import type { ValueMode } from '../spreadsheet'
import { chartTitle } from './chart-text.mapper'
import type { SlideChart } from './deck.model'

interface OpenSeries {
  name:       string[]
  categories: string[]
  values:     string[]
}

type Target = 'name' | 'categories' | 'values'

/**
 * Reads a chart part: its type, title and series, from the values the chart
 * caches next to its formulas (`c:strCache`, `c:numCache`), so the embedded
 * workbook is never needed. The title is its text once: its rich text runs,
 * or for a title linked to a cell the cached value, never the reference.
 *
 * @param xml - The chart part.
 * @param mode - `typed`: values as numbers (`null` where missing); `text`: as text.
 * @returns The chart.
 */
export function readChart (xml: string, mode: ValueMode): SlideChart<number | null | string> {
  let type = ''
  const title = chartTitle()
  const series: OpenSeries[] = []
  let current: OpenSeries | undefined
  let target: Target | undefined
  let point = 0
  let capturing = false
  let inPlotArea = false
  walkXml(xml, {
    open: (name, attributes) => {
      // Axis titles sit in the plot area: only the chart's own title is read.
      if (!inPlotArea && title.open(name)) return
      if (name === 'plotArea') {
        inPlotArea = true
      } else if (inPlotArea && type === '' && name.endsWith('Chart')) {
        type = name.slice(0, -'Chart'.length)
      } else if (name === 'ser') {
        current = { name: [], categories: [], values: [] }
      } else if (current !== undefined) {
        const next = targetOf(name)
        if (next !== undefined) {
          target = next
          point = 0
        } else if (name === 'ptCount' && target !== undefined) {
          // Points left out of the cache are missing values: keep their places.
          current[target].length = Math.max(current[target].length, Number(attributes.val ?? 0))
        } else if (name === 'pt') {
          point = Number(attributes.idx ?? 0)
        } else if (name === 'v') {
          capturing = true
          if (target !== undefined) current[target][point] = ''
        }
      }
    },
    text: (text) => {
      if (title.text(text)) return
      if (capturing && current !== undefined && target !== undefined) current[target][point] += text
    },
    close: (name) => {
      if (title.close(name)) return
      if (name === 'v') {
        capturing = false
      } else if (name === 'plotArea') {
        inPlotArea = false
      } else if (name === 'ser' && current !== undefined) {
        series.push(current)
        current = undefined
      } else if (targetOf(name) !== undefined) {
        target = undefined
      }
    },
  })

  const text = title.value()

  return {
    type,
    ...(text !== undefined && { title: text }),
    series: series.map(open => ({ name: open.name.join('').trim(), categories: Array.from(open.categories, text => text ?? ''), values: Array.from(open.values, text => chartValue(text, mode)) })),
  }
}

/** Where a series element's cached points go: its name, its categories (x values of a scatter), its values. */
function targetOf (name: string): Target | undefined {
  if (name === 'tx') return 'name'
  if (name === 'cat' || name === 'xVal') return 'categories'

  return name === 'val' || name === 'yVal' ? 'values' : undefined
}

/**
 * A cached point as a chart value.
 *
 * @param text - The point's text; `undefined` for a point left out of the cache.
 * @param mode - `typed`: a number, `null` where missing or not a number; `text`: the shortest round-trip text, `''` where missing.
 * @returns The value.
 */
export function chartValue (text: string | undefined, mode: ValueMode): number | null | string {
  const number = text === undefined || text.trim() === '' ? NaN : Number(text)
  if (mode === 'text') return Number.isNaN(number) ? (text ?? '') : String(number)

  return Number.isNaN(number) ? null : number
}
