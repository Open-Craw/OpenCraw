import { load } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'
import type { Sheet } from './workbook-document.model'

/**
 * Every `<table>` of an HTML document as a sheet (`table 1`, `table 2`…, in
 * document order), so the workbook table reader works on web pages and
 * rendered Markdown: rows in order (`thead`, `tbody`, `tfoot` alike), `th` and
 * `td` alike, cell text with whitespace collapsed (a line break or a paragraph
 * inside a cell counts as a space), `colspan` and `rowspan` as
 * merged ranges. A table inside a table is a sheet of its own, and its rows
 * are not its parent's.
 *
 * @param html - The document.
 * @returns The tables.
 */
export function htmlTableSheets (html: string): Sheet[] {
  const $ = load(html)

  const tables: Element[] = $('table').get()

  return tables.map((table, index) => {
    const all: Element[] = $(table).find('tr').get()
    const rows = all.filter(row => $(row).closest('table').get(0) === table)
    const grid: string[][] = []
    const merges: string[] = []
    for (const [rowIndex, row] of rows.entries()) {
      grid[rowIndex] ??= []
      let column = 0
      const cells: Element[] = $(row).children('th, td').get()
      for (const cell of cells) {
        while (grid[rowIndex][column] !== undefined) column += 1
        const columnSpan = span($(cell).attr('colspan'))
        const rowSpan = span($(cell).attr('rowspan'))
        for (let down = 0; down < rowSpan; down += 1) {
          grid[rowIndex + down] ??= []
          for (let across = 0; across < columnSpan; across += 1) grid[rowIndex + down][column + across] = ''
        }
        grid[rowIndex][column] = cellText(cell).replaceAll(/\s+/g, ' ').trim()
        if (columnSpan > 1 || rowSpan > 1) merges.push(`${letter(column)}${rowIndex + 1}:${letter(column + columnSpan - 1)}${rowIndex + rowSpan}`)
        column += columnSpan
      }
    }

    return { name: `table ${index + 1}`, rows: grid.slice(0, rows.length).map(row => Array.from(row, cell => cell ?? '')), merges }
  })
}

/** Elements whose edges separate words, as they do when the cell is rendered. */
const BLOCKS = new Set(['address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul'])

/**
 * A cell's text, with a space where a `<br>` or a block's edge breaks the
 * line: `2659<br>$560` reads `2659 $560`, not `2659$560`.
 *
 * @param node - The cell, or a node inside it.
 * @returns Its text.
 */
function cellText (node: AnyNode): string {
  if (node.type === 'text') return node.data
  if (!('children' in node) || !('name' in node)) return ''
  if (node.name === 'br') return ' '
  const inner = node.children.map(child => cellText(child)).join('')

  return BLOCKS.has(node.name) ? ` ${inner} ` : inner
}

function span (value: string | undefined): number {
  const number = Math.trunc(Number(value ?? '1'))

  return Number.isFinite(number) && number > 0 ? Math.min(number, 1000) : 1
}

function letter (index: number): string {
  let letters = ''
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCodePoint(65 + ((rest - 1) % 26)) + letters

  return letters
}
