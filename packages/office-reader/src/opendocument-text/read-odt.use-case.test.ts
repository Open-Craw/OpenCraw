import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { DocumentBlock } from '../document'
import { readOdt } from './read-odt.use-case'
import type { ReadOdtOptions } from './read-odt.use-case'

const NAMESPACES = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"'
const ODT_MIMETYPE = 'application/vnd.oasis.opendocument.text'

interface Parts {
  body:    string
  styles?: string
  master?: string
  meta?:   string
}

/** An `.odt` as the apps write it: a stored `mimetype` first, then `content.xml`, `styles.xml` and `meta.xml`. */
function odt ({ body, styles = '', master = '', meta = '' }: Parts): Uint8Array {
  const content = `<?xml version="1.0"?><office:document-content ${NAMESPACES}><office:automatic-styles>${styles}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`
  const stylesXml = `<?xml version="1.0"?><office:document-styles ${NAMESPACES}><office:master-styles><style:master-page style:name="Standard">${master}</style:master-page></office:master-styles></office:document-styles>`
  const metaXml = `<?xml version="1.0"?><office:document-meta ${NAMESPACES}><office:meta>${meta}</office:meta></office:document-meta>`

  return zipSync({ 'mimetype': [strToU8(ODT_MIMETYPE), { level: 0 }], 'content.xml': strToU8(content), 'styles.xml': strToU8(stylesXml), 'meta.xml': strToU8(metaXml) })
}

const p = (text: string, style = 'Standard'): string => `<text:p text:style-name="${style}">${text}</text:p>`
const h = (text: string, level: number): string => `<text:h text:style-name="Heading_20_${String(level)}" text:outline-level="${String(level)}">${text}</text:h>`
const cell = (...content: string[]): string => `<table:table-cell>${content.join('')}</table:table-cell>`
const row = (...cells: string[]): string => `<table:table-row>${cells.join('')}</table:table-row>`
const small = (text: string): string => `<table:table>${row(cell(p(text)))}</table:table>`

async function read (parts: Parts, options?: ReadOdtOptions): ReturnType<typeof readOdt> {
  return await readOdt(odt(parts), options)
}

describe('readOdt', () => {
  it('reads paragraphs and headings in order, with the heading level and the style, and drops empty paragraphs', async () => {
    const body = h('Offers', 1) + p('First  <text:s text:c="2"/>line<text:tab/>tab<text:line-break/>next', 'Body') + p(' '.repeat(3)) + h('Details', 2)
    const doc = await read({ body })

    expect(doc.body).toEqual([
      { kind: 'paragraph', text: 'Offers', style: 'Heading_20_1', heading: 1 },
      { kind: 'paragraph', text: 'First    line\ttab\nnext', style: 'Body' },
      { kind: 'paragraph', text: 'Details', style: 'Heading_20_2', heading: 2 },
    ])
  })

  it('knows Title and the Heading styles on plain paragraphs, through the style an automatic one is built on', async () => {
    const styles = '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Title"/><style:style style:name="P2" style:family="paragraph" style:parent-style-name="Heading_20_3"/>'
    const doc = await read({ body: p('Report', 'P1') + p('Part', 'P2'), styles })

    expect(doc.body).toEqual([
      { kind: 'paragraph', text: 'Report', style: 'Title', heading: 1 },
      { kind: 'paragraph', text: 'Part', style: 'Heading_20_3', heading: 3 },
    ])
  })

  it('reads list items with their level, and whether the list style numbers them', async () => {
    const styles = '<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1"/><text:list-level-style-bullet text:level="2"/></text:list-style><text:list-style style:name="L2"><text:list-level-style-number text:level="1"/></text:list-style>'
    const inner = '<text:list><text:list-item><text:p>child</text:p></text:list-item></text:list>'
    const bullets = `<text:list text:style-name="L1"><text:list-item><text:p>one</text:p>${inner}</text:list-item></text:list>`
    const numbered = '<text:list text:style-name="L2"><text:list-item><text:p>first</text:p></text:list-item></text:list>'
    const doc = await read({ body: bullets + numbered, styles })

    expect(doc.body).toEqual([
      { kind: 'paragraph', text: 'one', list: { level: 0, ordered: false } },
      { kind: 'paragraph', text: 'child', list: { level: 1, ordered: false } },
      { kind: 'paragraph', text: 'first', list: { level: 0, ordered: true } },
    ])
  })

  it('reads links with their text, and a link inside a paragraph keeps the paragraph whole', async () => {
    const link = '<text:a xlink:href="https://example.org/offers">the offers</text:a>'
    const doc = await read({ body: p(`See ${link} today`) })

    expect(doc.body).toEqual([{ kind: 'paragraph', text: 'See the offers today', style: 'Standard', links: [{ text: 'the offers', href: 'https://example.org/offers' }] }])
  })

  it('reads a table as a grid with merged cells as ranges, covered cells empty, and names it', async () => {
    const wide = '<table:table-cell table:number-columns-spanned="2"><text:p>Price</text:p></table:table-cell><table:covered-table-cell/>'
    const tall = '<table:table-cell table:number-rows-spanned="2"><text:p>Fiat</text:p></table:table-cell>'
    const first = row(wide, cell(p('x')))
    const second = row(tall, cell(p('a')), cell(p('b')))
    const third = row('<table:covered-table-cell/>', cell(p('c')), cell(p('d')))
    const body = `<table:table table:name="Table1">${first}${second}${third}</table:table>`
    const doc = await read({ body })

    expect(doc.body).toEqual([{ kind: 'table', name: 'table 1', hidden: false, rows: [['Price', '', 'x'], ['Fiat', 'a', 'b'], ['', 'c', 'd']], hiddenRows: [], merges: ['A1:B1', 'A2:A3'] }])
  })

  it('reads a table inside a cell as a block of its own whose text also joins the cell', async () => {
    const inner = `<table:table table:name="Inner">${row(cell(p('deep')), cell(p('er')))}</table:table>`
    const outer = `<table:table table:name="Outer">${row(cell(p('top'), inner))}</table:table>`
    const doc = await read({ body: outer })

    expect(doc.body.map(block => (block.kind === 'table' ? [block.name, block.rows] : block.text))).toEqual([['table 1', [['deep', 'er']]], ['table 2', [['top\ndeep er']]]])
  })

  it('reads footnotes and endnotes as notes, leaving them out of the paragraph, and skips deletions and comments', async () => {
    const footnote = '<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>The source.</text:p><text:p>Second line.</text:p></text:note-body></text:note>'
    const endnote = '<text:note text:id="edn1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p>At the end.</text:p></text:note-body></text:note>'
    const comment = '<office:annotation><text:p>private comment</text:p></office:annotation>'
    const tracked = '<text:tracked-changes><text:changed-region><text:deletion><text:p>deleted text</text:p></text:deletion></text:changed-region></text:tracked-changes>'
    const doc = await read({ body: tracked + p(`Claim${footnote} made${endnote}.${comment}`) })

    expect(doc.body).toEqual([{ kind: 'paragraph', text: 'Claim made.', style: 'Standard' }])
    expect(doc.notes).toEqual([{ kind: 'footnote', id: 'ftn1', text: 'The source.\nSecond line.' }, { kind: 'endnote', id: 'edn1', text: 'At the end.' }])
  })

  it('puts a paragraph in a text box after the paragraph that holds the box', async () => {
    const box = '<draw:frame><draw:text-box><text:p>boxed</text:p></draw:text-box></draw:frame>'
    const doc = await read({ body: p(`before ${box}after`) + p('next') })

    expect(doc.body.map(block => (block.kind === 'paragraph' ? block.text : ''))).toEqual(['before after', 'boxed', 'next'])
  })

  it('does not read the templates of a table of contents, but reads its entries', async () => {
    const toc = '<text:table-of-content><text:table-of-content-source><text:index-title-template><text:p>template</text:p></text:index-title-template></text:table-of-content-source><text:index-body><text:p>1 Offers</text:p></text:index-body></text:table-of-content>'
    const doc = await read({ body: toc })

    expect(doc.body.map(block => (block.kind === 'paragraph' ? block.text : ''))).toEqual(['1 Offers'])
  })

  it('reads headers and footers from the master page, the title from the properties, and leaves the extras out on request', async () => {
    const master = '<style:header><text:p>Page header</text:p></style:header><style:footer><text:p>Page footer</text:p></style:footer><style:footer-left><text:p>Left footer</text:p></style:footer-left>'
    const parts = { body: p('Body text'), master, meta: '<dc:title>Price list</dc:title>' }
    const doc = await read(parts)

    expect(doc.title).toBe('Price list')
    expect(doc.headers).toEqual([[{ kind: 'paragraph', text: 'Page header' }]])
    expect(doc.footers).toEqual([[{ kind: 'paragraph', text: 'Page footer' }], [{ kind: 'paragraph', text: 'Left footer' }]])
    const plain = await read(parts, { extras: false })
    expect(plain.headers).toEqual([])
    expect(plain.footers).toEqual([])
    expect(plain.notes).toEqual([])
  })

  it('numbers the tables over the document: headers first, then the body, then the footers', async () => {
    const master = `<style:header>${small('in header')}</style:header><style:footer>${small('in footer')}</style:footer>`
    const doc = await read({ body: small('in body'), master })

    expect([doc.headers[0][0], doc.body[0], doc.footers[0][0]].map(block => (block.kind === 'table' ? block.name : ''))).toEqual(['table 1', 'table 2', 'table 3'])
  })

  it('refuses other files with the reason', async () => {
    const ods = zipSync({ 'mimetype': [strToU8('application/vnd.oasis.opendocument.spreadsheet'), { level: 0 }], 'content.xml': strToU8('<x/>') })
    const empty = zipSync({ 'mimetype': [strToU8(ODT_MIMETYPE), { level: 0 }], 'content.xml': strToU8('<office:document-content/>') })

    await expect(readOdt(ods)).rejects.toMatchObject({ code: 'unsupported-format' })
    await expect(readOdt(empty)).rejects.toMatchObject({ code: 'not-odt' })
    await expect(readOdt(new TextEncoder().encode('plain text'))).rejects.toMatchObject({ code: 'not-zip' })
  })
})

/** What the two formats say alike: not the style names, which each application names its own way, nor the order merged ranges are listed in. */
function withoutStyles (blocks: DocumentBlock[]): unknown[] {
  return blocks.map((block) => {
    if (block.kind === 'table') return { ...block, merges: [...block.merges].sort((a, b) => a.localeCompare(b)) }
    const { style: _style, ...rest } = block

    return rest
  })
}

describe('readOdt on a document also saved as .docx', () => {
  it('gives the same body, headers, footers, notes and title as readDocx', async () => {
    const { readDocx } = await import('../document')
    const fromOdt = await readOdt(join(__dirname, 'fixtures', 'incentivi.odt'))
    const fromDocx = await readDocx(join(__dirname, '..', 'document', 'fixtures', 'incentivi.docx'))

    expect(fromOdt.title).toBe(fromDocx.title)
    expect(withoutStyles(fromOdt.body)).toEqual(withoutStyles(fromDocx.body))
    expect(fromOdt.headers.map(blocks => withoutStyles(blocks))).toEqual(fromDocx.headers.map(blocks => withoutStyles(blocks)))
    expect(fromOdt.footers.map(blocks => withoutStyles(blocks))).toEqual(fromDocx.footers.map(blocks => withoutStyles(blocks)))
    expect(fromOdt.notes).toEqual(fromDocx.notes)
  })
})
