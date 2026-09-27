import { walkXml } from '../ooxml-package'
import type { ValueMode } from '../spreadsheet'
import { chartValue } from './chart.mapper'
import { chartText, chartTitle } from './chart-text.mapper'
import type { TextReader } from './chart-text.mapper'
import type { SlideChart } from './deck.model'

/** One dimension of a data block: `cat`, `val`, `x`, `y`, `size`, `colorVal`, `entityId`… */
interface Dimension {
  type:   string
  /** Its first level's points: the leaves of a hierarchy (a treemap's, a sunburst's). */
  points: (string | undefined)[]
}

interface OpenSeries {
  layout: string
  name:   TextReader
  dataId: string
}

/** Where a series' categories come from, in order of preference. */
const CATEGORIES = ['cat', 'entityId', 'x']
/** Where its values come from, in order of preference. */
const VALUES = ['val', 'colorVal', 'y', 'size']

/**
 * Reads a `chartEx` part, the chart types Office added in 2016 (waterfall,
 * treemap, sunburst, histogram and Pareto, box and whisker, funnel, region
 * map), from the data the part caches (`cx:chartData`): each `cx:data` block's
 * `cx:strDim` and `cx:numDim` points, which a series names by `cx:dataId`. The
 * type is the first series' `layoutId`; the title is read as a classic
 * chart's. A hierarchy's categories are its leaves (the first level).
 *
 * @param xml - The chart part.
 * @param mode - `typed`: values as numbers (`null` where missing); `text`: as text.
 * @returns The chart.
 */
export function readChartEx (xml: string, mode: ValueMode): SlideChart<number | null | string> {
  const data = new Map<string, Dimension[]>()
  const title = chartTitle()
  const series: OpenSeries[] = []
  let block: Dimension[] | undefined
  let dimension: Dimension | undefined
  let level = 0
  let point: number | undefined
  let current: OpenSeries | undefined
  let inName = false
  let inPlotArea = false
  walkXml(xml, {
    open: (name, attributes) => {
      if (!inPlotArea && title.open(name)) return
      if (inName) {
        current?.name.open(name)

        return
      }
      switch (name) {
        case 'plotArea': {
          inPlotArea = true

          break
        }
        case 'data': {
          block = []
          data.set(attributes.id ?? '', block)

          break
        }
        case 'strDim':
        case 'numDim': {
          dimension = { type: attributes.type ?? '', points: [] }
          block?.push(dimension)
          level = 0

          break
        }
        case 'lvl': {
          level += 1
          // Points left out of the cache are missing values: keep their places.
          if (dimension !== undefined && level === 1) dimension.points.length = Number(attributes.ptCount ?? 0)

          break
        }
        case 'pt': {
          if (dimension !== undefined && level === 1) {
            point = Number(attributes.idx ?? 0)
            dimension.points[point] = ''
          }

          break
        }
        case 'series': {
          current = { layout: attributes.layoutId ?? '', name: chartText(), dataId: '' }

          break
        }
        case 'tx': {
          inName = current !== undefined

          break
        }
        case 'dataId': {
          if (current !== undefined) current.dataId = attributes.val ?? ''

          break
        }
        // No default
      }
    },
    text: (text) => {
      if (title.text(text)) return
      if (inName) current?.name.text(text)
      else if (dimension !== undefined && point !== undefined) dimension.points[point] += text
    },
    close: (name) => {
      if (title.close(name)) return
      if (name === 'tx') {
        inName = false
      } else if (inName) {
        current?.name.close(name)
      } else switch (name) {
        case 'pt': {
          point = undefined

          break
        }
        case 'strDim':
        case 'numDim': {
          dimension = undefined

          break
        }
        case 'data': {
          block = undefined

          break
        }
        default: { if (name === 'series' && current !== undefined) {
          series.push(current)
          current = undefined
        } else if (name === 'plotArea') {
          inPlotArea = false
        }
        }
      }
    },
  })
  const text = title.value()

  return {
    type:   series[0]?.layout ?? '',
    ...(text !== undefined && { title: text }),
    series: series.map((open) => {
      const dimensions = data.get(open.dataId) ?? []
      const categories = pick(dimensions, CATEGORIES)
      const values = pick(dimensions, VALUES)

      return {
        name:       open.name.value(),
        categories: Array.from(categories, text => text ?? ''),
        values:     Array.from(values, text => chartValue(text, mode)),
      }
    }),
  }
}

/** The points of the first dimension of a preferred type. */
function pick (dimensions: readonly Dimension[], types: readonly string[]): (string | undefined)[] {
  for (const type of types) {
    const found = dimensions.find(dimension => dimension.type === type)
    if (found !== undefined) return found.points
  }

  return []
}
