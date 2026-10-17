import type { DocumentBlock, DocumentLink, DocumentNote, DocumentTable, Paragraph } from '../document'
import { OdfTable } from '../opendocument-table'
import { walkXml } from '../ooxml-package'
import { headingOfStyle, isOrderedList, namedStyle } from './odt-styles.mapper'
import type { OdtStyles } from './odt-styles.mapper'

/** The blocks of one part of the document (the body, a header, a footer) and the notes its paragraphs hold. */
export interface OdtPart {
  /** The element that held it: `text` for the body, `header`, `footer-left`... */
  root:   string
  blocks: DocumentBlock[]
  notes:  DocumentNote[]
}

interface OpenParagraph {
  text:     string
  style?:   string
  heading?: number
  /** The list item it sits in: its level from 0 and the list style that numbers it. */
  list?:    { level: number, style: string | undefined }
  links:    DocumentLink[]
  link?:    { href: string, from: number }
  /** Blocks of the text boxes it holds: they follow it. */
  boxed:    DocumentBlock[]
}

/** Elements whose content is not part of the text: tracked changes, the templates of indexes, the number of a note, comments, declarations. */
const SKIPPED = new Set([
  'tracked-changes', 'table-of-content-source', 'illustration-index-source', 'table-index-source', 'object-index-source', 'user-index-source',
  'alphabetical-index-source', 'bibliography-source', 'note-citation', 'annotation', 'sequence-decls', 'variable-decls', 'user-field-decls',
])

function count (value: string | undefined): number {
  const number = Math.trunc(Number(value ?? ''))

  return Number.isNaN(number) || number < 1 ? 1 : number
}

/**
 * Reads the parts of an OpenDocument text document: paragraphs with their style, heading level, list level and links, and tables as grids with
 * their merged cells as ranges. Tracked deletions, comments and the templates of indexes are not text. A paragraph in a text box comes after the
 * paragraph that holds the box; a table inside a cell is a block of its own, and its text also joins the cell's. Footnotes and endnotes come
 * back as notes, one per note, their paragraphs joined.
 *
 * @param xml - `content.xml` or `styles.xml`.
 * @param roots - The element names that hold a part (`text` for the body of `content.xml`; the headers and footers of `styles.xml`).
 * @param styles - The document's paragraph and list styles.
 * @returns One part per root met, in document order; tables are not named yet.
 */
export function odtParts (xml: string, roots: ReadonlySet<string>, styles: OdtStyles): OdtPart[] {
  const parts: OdtPart[] = []
  let part: OdtPart | undefined
  let rootDepth = 0
  let note: { kind: DocumentNote['kind'], id: string, paragraphs: string[] } | undefined
  let paragraphs: OpenParagraph[] = []
  let tables: OdfTable[] = []
  let lists: { style: string | undefined }[] = []
  // Where a paragraph that closes goes: a table cell, or the list of blocks (the body, a text box).
  let containers: ('cell' | 'blocks')[] = ['blocks']
  const listsOfCells: { style: string | undefined }[][] = []
  let skipping = 0

  const append = (text: string): void => {
    const paragraph = paragraphs.at(-1)
    if (paragraph !== undefined && skipping === 0) paragraph.text += text
  }

  function finishParagraph (open: OpenParagraph, current: OdtPart): void {
    const text = open.text.replaceAll(/[ \t]+\n/g, '\n').trim()
    const block: Paragraph | undefined = text === '' ? undefined : paragraphBlock(open, text, styles)
    const emitted = [...(block === undefined ? [] : [block]), ...open.boxed]
    const host = paragraphs.at(-1)
    if (note !== undefined) {
      if (text !== '') note.paragraphs.push(text)
    } else if (containers.at(-1) === 'cell') {
      for (const piece of [text, ...open.boxed.map(boxed => (boxed.kind === 'paragraph' ? boxed.text : ''))]) tables.at(-1)?.addParagraph(piece)
    } else if (host === undefined) {
      current.blocks.push(...emitted)
    } else {
      // A paragraph in a text box waits for the paragraph holding the box.
      host.boxed.push(...emitted)
    }
  }

  walkXml(xml, {
    open: (name, attributes) => {
      if (rootDepth === 0 && roots.has(name)) {
        rootDepth = 1
        part = { root: name, blocks: [], notes: [] }
        parts.push(part)
        paragraphs = []
        tables = []
        lists = []
        containers = ['blocks']
        note = undefined
        skipping = 0

        return
      }
      if (part === undefined) return
      if (roots.has(name)) rootDepth += 1
      if (SKIPPED.has(name)) {
        skipping += 1

        return
      }
      if (skipping > 0) return
      const table = tables.at(-1)
      switch (name) {
        case 'p':
        case 'h': {
          const style = attributes['text:style-name']
          const top = lists.at(-1)
          const heading = name === 'h' ? Math.min(9, count(attributes['text:outline-level'])) : headingOfStyle(styles, style)
          paragraphs.push({ text: '', ...(style !== undefined && { style }), ...(heading !== undefined && { heading }), ...(top !== undefined && heading === undefined && { list: { level: lists.length - 1, style: top.style } }), links: [], boxed: [] })
          break
        }
        case 'list': {
          lists.push({ style: attributes['text:style-name'] ?? lists.at(-1)?.style })
          break
        }
        case 's': {
          append(' '.repeat(count(attributes['text:c'])))
          break
        }
        case 'tab': {
          append('\t')
          break
        }
        case 'line-break': {
          append('\n')
          break
        }
        case 'a': {
          const paragraph = paragraphs.at(-1)
          const href = attributes['xlink:href']
          if (paragraph !== undefined && href !== undefined) paragraph.link = { href, from: paragraph.text.length }
          break
        }
        case 'note': {
          note = { kind: attributes['text:note-class'] === 'endnote' ? 'endnote' : 'footnote', id: attributes['text:id'] ?? '', paragraphs: [] }
          break
        }
        case 'table': {
          tables.push(new OdfTable())
          break
        }
        case 'table-row': {
          table?.openRow(attributes)
          break
        }
        case 'table-cell':
        case 'covered-table-cell': {
          if (table !== undefined) {
            table.openCell(attributes)
            containers.push('cell')
            listsOfCells.push(lists)
            lists = []
          }
          break
        }
        // No default
      }
    },
    text: (text) => {
      if (part !== undefined && skipping === 0) append(text)
    },
    close: (name) => {
      if (part === undefined) return
      if (SKIPPED.has(name)) {
        skipping -= 1

        return
      }
      if (skipping > 0) return
      switch (name) {
        case 'p':
        case 'h': {
          const open = paragraphs.pop()
          if (open !== undefined) finishParagraph(open, part)
          break
        }
        case 'list': {
          lists.pop()
          break
        }
        case 'a': {
          const paragraph = paragraphs.at(-1)
          if (paragraph?.link !== undefined) {
            const text = paragraph.text.slice(paragraph.link.from).trim()
            if (text !== '') paragraph.links.push({ text, href: paragraph.link.href })
            paragraph.link = undefined
          }
          break
        }
        case 'note': {
          if (note !== undefined && note.paragraphs.length > 0) part.notes.push({ kind: note.kind, id: note.id, text: note.paragraphs.join('\n') })
          note = undefined
          break
        }
        case 'table-cell':
        case 'covered-table-cell': {
          const table = tables.at(-1)
          if (table?.inCell !== true) break
          containers.pop()
          lists = listsOfCells.pop() ?? []
          table.closeCell()
          break
        }
        case 'table-row': {
          tables.at(-1)?.closeRow()
          break
        }
        case 'table': {
          const table = tables.pop()
          if (table === undefined) break
          const block: DocumentTable = { kind: 'table', name: '', hidden: false, rows: table.rows, hiddenRows: [], merges: table.merges }
          // A table inside a cell: its text belongs to the cell too.
          const outer = tables.at(-1)
          if (outer?.inCell === true) {
            part.blocks.push(block)
            outer.addParagraph(table.text)
          } else {
            const host = paragraphs.at(-1)
            if (host === undefined) part.blocks.push(block)
            else host.boxed.push(block)
          }
          break
        }
        // No default
      }
      if (roots.has(name)) {
        rootDepth -= 1
        if (rootDepth === 0) part = undefined
      }
    },
  })

  return parts
}

function paragraphBlock (open: OpenParagraph, text: string, styles: OdtStyles): Paragraph {
  const style = namedStyle(styles, open.style)
  const list = open.list === undefined ? undefined : { level: open.list.level, ordered: isOrderedList(styles, open.list.style, open.list.level + 1) }

  return {
    kind: 'paragraph',
    text,
    ...(style !== undefined && { style }),
    ...(open.heading !== undefined && { heading: open.heading }),
    ...(list !== undefined && { list }),
    ...(open.links.length > 0 && { links: open.links }),
  }
}
