import { walkXml } from '../ooxml-package'
import type { SlideChart } from '../presentation'
import type { ValueMode } from '../spreadsheet'

/** The chart types the `.pptx` reader names differently: ODF's `circle` is a pie and `ring` a doughnut. */
const TYPES: Readonly<Record<string, string>> = { circle: 'pie', ring: 'doughnut' }

interface OpenCell {
  text:  string
  value: string | undefined
}

/**
 * Reads a chart object of an OpenDocument presentation (the `content.xml` of `Object 1`): its type, its title once (an axis's title is not it), and
 * its series from the data table the chart keeps with it: the header row names the series, the first column holds the categories and each other
 * column is one series' values, a missing point `null` (`''` in text mode).
 *
 * @param xml - The object's `content.xml`.
 * @param mode - `typed`: values as numbers; `text`: as text.
 * @returns The chart, or `undefined` when the object is not a chart (a formula, an embedded spreadsheet) or has no data.
 */
export function odpChart (xml: string, mode: ValueMode): SlideChart<number | null | string> | undefined {
  let type: string | undefined
  let title: string | undefined
  let inTitle = false
  let axisDepth = 0
  let inTable = false
  let header = false
  let row: OpenCell[] | undefined
  let cell: OpenCell | undefined
  let inParagraph = false
  const rows: { header: boolean, cells: OpenCell[] }[] = []
  walkXml(xml, {
    open: (name, attributes) => {
      switch (name) {
        case 'chart': {
          type ??= attributes['chart:class']?.replace(/^chart:/, '')
          break
        }
        case 'axis': {
          axisDepth += 1
          break
        }
        case 'title': {
          if (axisDepth === 0 && title === undefined) inTitle = true
          break
        }
        case 'table': {
          inTable = true
          header = false
          break
        }
        case 'table-header-rows': {
          header = true
          break
        }
        case 'table-rows': {
          header = false
          break
        }
        case 'table-row': {
          if (inTable) row = []
          break
        }
        case 'table-cell': {
          if (row !== undefined) cell = { text: '', value: attributes['office:value'] }
          break
        }
        case 'p': {
          inParagraph = true
          if (inTitle) title = ''
          break
        }
        // No default
      }
    },
    text: (text) => {
      if (!inParagraph) return
      if (inTitle) title = (title ?? '') + text
      else if (cell !== undefined) cell.text += text
    },
    close: (name) => {
      switch (name) {
        case 'p': {
          inParagraph = false
          break
        }
        case 'title': {
          inTitle = false
          break
        }
        case 'axis': {
          axisDepth -= 1
          break
        }
        case 'table-cell': {
          if (cell !== undefined) row?.push(cell)
          cell = undefined
          break
        }
        case 'table-row': {
          if (row !== undefined) rows.push({ header, cells: row })
          row = undefined
          break
        }
        case 'table': {
          inTable = false
          break
        }
        // No default
      }
    },
  })
  if (type === undefined) return undefined
  const names = rows.find(candidate => candidate.header)?.cells ?? []
  const body = rows.filter(candidate => !candidate.header)
  const columns = Math.max(0, ...body.map(candidate => candidate.cells.length))
  if (body.length === 0 || columns < 2) return undefined
  const categories = body.map(candidate => candidate.cells[0]?.text.trim() ?? '')
  const series = Array.from({ length: columns - 1 }, (_, index) => ({
    name:   names[index + 1]?.text.trim() ?? '',
    categories,
    values: body.map((candidate) => {
      const value = candidate.cells[index + 1]?.value
      const number = value === undefined || value.trim() === '' ? undefined : Number(value)
      if (number === undefined || Number.isNaN(number)) return mode === 'text' ? '' : null

      return mode === 'text' ? String(number) : number
    }),
  }))
  const kind = TYPES[type] ?? type

  return { type: kind, ...(title !== undefined && title.trim() !== '' && { title: title.trim() }), series }
}
