import type { DocumentBlock, DocumentTable, WordDocument } from '../document'
import { OoxmlPackage, walkXml } from '../ooxml-package'
import type { PackageLimits } from '../ooxml-package'
import { OfficeReadError } from '../read-error'
import { readSource } from '../source-bytes'
import type { OfficeSource } from '../source-bytes'
import { odtParts } from './odt-blocks.mapper'
import type { OdtPart } from './odt-blocks.mapper'
import { emptyOdtStyles, readOdtStyles } from './odt-styles.mapper'

/** How to read an OpenDocument text document; the same choices as `readDocx`. */
export interface ReadOdtOptions {
  /** Read headers, footers and notes; default true. */
  extras?: boolean
  /** How much the file may inflate to. */
  limits?: PackageLimits
}

/** The media type an OpenDocument text document declares in its `mimetype` entry. */
const ODT_MIMETYPE = 'application/vnd.oasis.opendocument.text'

const HEADERS: ReadonlySet<string> = new Set(['header', 'header-left', 'header-first'])
const FOOTERS: ReadonlySet<string> = new Set(['footer', 'footer-left', 'footer-first'])
const EXTRAS: ReadonlySet<string> = new Set(['header', 'header-left', 'header-first', 'footer', 'footer-left', 'footer-first'])
const BODY = new Set(['text'])

/** The `dc:title` of `meta.xml`, when set. */
function titleOf (xml: string): string | undefined {
  let inTitle = false
  let title = ''
  walkXml(xml, {
    open:  (name) => { inTitle = name === 'title' },
    text:  (text) => { if (inTitle) title += text },
    close: () => { inTitle = false },
  })
  title = title.trim()

  return title === '' ? undefined : title
}

/** Names the tables `table 1`, `table 2`… over the document in the order headers, body, footers, so no two share a name. */
function nameTables (...groups: DocumentBlock[][][]): void {
  const tables = groups.flat().flat().filter((block): block is DocumentTable => block.kind === 'table')
  for (const [index, table] of tables.entries()) table.name = `table ${String(index + 1)}`
}

/** The blocks of the parts that have any. */
function blocksOf (parts: OdtPart[], roots: ReadonlySet<string>): DocumentBlock[][] {
  return parts.filter(part => roots.has(part.root)).map(part => part.blocks).filter(blocks => blocks.length > 0)
}

/**
 * Reads an OpenDocument text document (`.odt`, as LibreOffice, Google Docs and Word save it) into the same {@link WordDocument} model `readDocx` gives:
 * its body as paragraphs (with heading and list levels, and links) and tables (with merged cells), its headers and footers, its footnotes and
 * endnotes, and its title. Tracked deletions and comments are not text.
 *
 * @param source - A path, bytes, a Blob or a stream (see {@link OfficeSource}).
 * @param options - Whether to read headers, footers and notes; the limits.
 * @returns The document.
 * @throws OfficeReadError for a file that is not a readable text document: `not-zip`, `legacy-format`, `unsupported-format` (another kind of file), `not-odt`, `too-large`…
 */
export async function readOdt (source: OfficeSource, options: ReadOdtOptions = {}): Promise<WordDocument> {
  const pkg = OoxmlPackage.openOpenDocument(await readSource(source), ODT_MIMETYPE, options.limits)
  const content = pkg.text('content.xml')
  const stylesXml = pkg.text('styles.xml')
  const styles = emptyOdtStyles()
  readOdtStyles(stylesXml, styles)
  readOdtStyles(content, styles)
  const [body] = odtParts(content, BODY, styles)
  if (body === undefined) throw new OfficeReadError('not-odt', 'not a text document: content.xml has no text body')
  const extras = options.extras === false ? [] : odtParts(stylesXml, EXTRAS, styles)
  const headers = blocksOf(extras, HEADERS)
  const footers = blocksOf(extras, FOOTERS)
  nameTables(headers, [body.blocks], footers)
  const title = titleOf(pkg.text('meta.xml'))

  return { ...(title !== undefined && { title }), body: body.blocks, headers, footers, notes: options.extras === false ? [] : body.notes }
}
