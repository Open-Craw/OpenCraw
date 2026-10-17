import { OdfTable } from '../opendocument-table'
import { walkXml } from '../ooxml-package'
import type { SlideShape } from '../presentation'
import type { Sheet } from '../spreadsheet'
import { pointsOf } from './odp-length.algorithm'

/** One slide as `content.xml` holds it, before charts, notes and filters are applied. */
export interface OdpSlide {
  /** The master page it uses. */
  master?:    string
  /** The automatic style of the page: where `presentation:visibility="hidden"` is written. */
  style?:     string
  title?:     string
  shapes:     SlideShape[]
  tables:     Sheet<string>[]
  /** The objects (charts) on the slide, as the links to their folders in the package (`./Object 1`). */
  chartLinks: string[]
  notes:      string
}

/** What `content.xml` holds: the slides, and the page styles that hide a slide. */
export interface OdpContent {
  slides:       OdpSlide[]
  hiddenStyles: Set<string>
}

interface Target {
  x:           number
  y:           number
  width:       number
  height:      number
  /** `presentation:class`: `title`, `outline`, `notes`, `footer`... */
  placeholder: string | undefined
  paragraphs:  string[]
  chartLink?:  string
}

/** Elements that carry their own position and may hold text, besides `draw:frame`. */
const SHAPES = new Set(['custom-shape', 'rect', 'ellipse', 'circle', 'polygon', 'polyline', 'path', 'caption', 'line', 'connector', 'measure'])

/** The placeholders that are not the slide's content: its footer, its date and its slide number. */
const FURNITURE = new Set(['footer', 'date-time', 'page-number', 'header'])

/** The name the `.pptx` reader gives a placeholder, for the classes that have one. */
const PLACEHOLDER_NAMES: Readonly<Record<string, string>> = { title: 'title', subtitle: 'subTitle', outline: 'body', text: 'body' }

function count (value: string | undefined): number {
  const number = Math.trunc(Number(value ?? ''))

  return Number.isNaN(number) || number < 1 ? 1 : number
}

/**
 * Reads the slides of an OpenDocument presentation's `content.xml`: each slide's text boxes with their positions in points (a frame, or a shape
 * that holds text), its title, its tables, the links to its charts and its speaker notes. Footers, dates and slide numbers are left out, text
 * boxes come in reading order (top to bottom, left to right), and a table is a block of its own, its text not part of any box.
 *
 * @param xml - The text of `content.xml`.
 * @returns The slides in order, and the page styles that hide one.
 */
export function odpSlides (xml: string): OdpContent {
  const slides: OdpSlide[] = []
  const hiddenStyles = new Set<string>()
  let styleName = ''
  let slide: OdpSlide | undefined
  let inNotes = false
  let skipping = 0
  const targets: Target[] = []
  const tables: OdfTable[] = []
  const paragraphs: string[] = []

  function appendText (text: string): void {
    if (skipping === 0 && paragraphs.length > 0) paragraphs[paragraphs.length - 1] += text
  }

  function finishTarget (target: Target, current: OdpSlide): void {
    const text = target.paragraphs.join('\n').trim()
    if (target.chartLink !== undefined) current.chartLinks.push(target.chartLink)
    if (text === '' || FURNITURE.has(target.placeholder ?? '')) return
    if (inNotes) {
      // A notes page holds the notes in a frame that is usually, not always, marked as such: the thumbnail of the slide has no text, the rest is furniture.
      current.notes += `${current.notes === '' ? '' : '\n'}${text}`

      return
    }
    const placeholder = target.placeholder === undefined ? undefined : PLACEHOLDER_NAMES[target.placeholder]
    if (placeholder === 'title') current.title ??= text
    current.shapes.push({ x: target.x, y: target.y, width: target.width, height: target.height, text, ...(placeholder !== undefined && { placeholder }) })
  }

  walkXml(xml, {
    open: (name, attributes) => {
      if (name === 'annotation') skipping += 1
      if (skipping > 0) return
      switch (name) {
        case 'style': {
          styleName = attributes['style:name'] ?? ''
          break
        }
        case 'drawing-page-properties': {
          if (attributes['presentation:visibility'] === 'hidden') hiddenStyles.add(styleName)
          break
        }
        case 'page': {
          slide = { ...(attributes['draw:master-page-name'] !== undefined && { master: attributes['draw:master-page-name'] }), ...(attributes['draw:style-name'] !== undefined && { style: attributes['draw:style-name'] }), shapes: [], tables: [], chartLinks: [], notes: '' }
          slides.push(slide)
          break
        }
        case 'notes': {
          inNotes = slide !== undefined
          break
        }
        case 'object': {
          const link = attributes['xlink:href']
          const target = targets.at(-1)
          if (target !== undefined && link !== undefined) target.chartLink = link
          break
        }
        case 'table': {
          if (slide !== undefined && !inNotes) tables.push(new OdfTable())
          break
        }
        case 'table-row': {
          tables.at(-1)?.openRow(attributes)
          break
        }
        case 'table-cell':
        case 'covered-table-cell': {
          tables.at(-1)?.openCell(attributes)
          break
        }
        case 'p':
        case 'h': {
          paragraphs.push('')
          break
        }
        case 's': {
          appendText(' '.repeat(count(attributes['text:c'])))
          break
        }
        case 'tab': {
          appendText('\t')
          break
        }
        case 'line-break': {
          appendText('\n')
          break
        }
        default: {
          if (name === 'frame' || SHAPES.has(name)) {
            targets.push({
              x:           pointsOf(attributes['svg:x']) ?? 0,
              y:           pointsOf(attributes['svg:y']) ?? 0,
              width:       pointsOf(attributes['svg:width']) ?? 0,
              height:      pointsOf(attributes['svg:height']) ?? 0,
              placeholder: attributes['presentation:class'],
              paragraphs:  [],
            })
          }
        }
      }
    },
    text: (text) => {
      appendText(text)
    },
    close: (name) => {
      if (name === 'annotation') {
        skipping -= 1

        return
      }
      if (skipping > 0) return
      switch (name) {
        case 'p':
        case 'h': {
          const text = paragraphs.pop()
          if (text === undefined) break
          const table = tables.at(-1)
          if (table?.inCell === true) table.addParagraph(text)
          else targets.at(-1)?.paragraphs.push(text)
          break
        }
        case 'table-cell':
        case 'covered-table-cell': {
          tables.at(-1)?.closeCell()
          break
        }
        case 'table-row': {
          tables.at(-1)?.closeRow()
          break
        }
        case 'table': {
          const table = tables.pop()
          if (table === undefined || slide === undefined) break
          const outer = tables.at(-1)
          if (outer?.inCell === true) outer.addParagraph(table.text)
          else slide.tables.push({ name: `table ${String(slide.tables.length + 1)}`, hidden: false, rows: table.rows, hiddenRows: [], merges: table.merges })
          break
        }
        case 'notes': {
          inNotes = false
          break
        }
        case 'page': {
          if (slide !== undefined) slide.shapes.sort((first, second) => Math.round(first.y) - Math.round(second.y) || first.x - second.x)
          slide = undefined
          break
        }
        default: {
          if (name === 'frame' || SHAPES.has(name)) {
            const target = targets.pop()
            if (target !== undefined && slide !== undefined) finishTarget(target, slide)
          }
        }
      }
    },
  })

  return { slides, hiddenStyles }
}
