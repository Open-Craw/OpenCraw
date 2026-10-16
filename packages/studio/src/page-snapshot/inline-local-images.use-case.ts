import { readFile } from 'node:fs/promises'
import { dirname, extname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'

/** What `inlineLocalImages` made of a document. */
export interface InlinedImages {
  html:    string
  /** How many images were embedded. */
  inlined: number
  /** How many pictures could not be found next to the file (or were too big), so they stay as they were. */
  missing: number
}

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp' }
/** The most one picture may weigh to be embedded, and the most all of a document's pictures may (bytes). */
const MAX_IMAGE_BYTES = 1_500_000
const MAX_TOTAL_BYTES = 8_000_000

/** An image address made absolute against the document's own; one that cannot be read as an address is left as it is. */
function absoluteAddress (source: string, documentUrl: string): string {
  try {
    return new URL(source, documentUrl).href
  } catch {
    return source
  }
}

/** A file's bytes, or `undefined` when it cannot be read. */
async function readIfThere (path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path)
  } catch {
    return undefined
  }
}

/** The file a `file:` image address names, when it sits in the document's own folder or below it; `undefined` for anything else (another site, another folder). */
function localPathOf (source: string, documentFolder: string): string | undefined {
  if (!source.startsWith('file:')) return undefined
  let path: string
  try {
    path = fileURLToPath(source)
  } catch {
    return undefined
  }
  const inside = relative(documentFolder, path)

  return inside === '' || inside.startsWith('..') || inside.split(sep).includes('..') ? undefined : path
}

/**
 * A document read from a file (a Markdown file, say) names its pictures by paths beside it, which the browser showing it cannot open. The
 * pictures that sit in the document's own folder are embedded in the page as data addresses, so they show; ones that are not there are counted
 * so the person is told. Nothing outside the document's folder is ever read.
 *
 * @param html - The document as HTML, its addresses already made absolute against `documentUrl`.
 * @param documentUrl - The document's own `file:` address.
 * @returns The page with the pictures embedded, and how many were embedded and how many could not be.
 */
export async function inlineLocalImages (html: string, documentUrl: string): Promise<InlinedImages> {
  if (!documentUrl.startsWith('file:')) return { html, inlined: 0, missing: 0 }
  const $ = load(html)
  const folder = dirname(fileURLToPath(documentUrl))
  let inlined = 0
  let missing = 0
  let total = 0
  for (const element of $('img[src]')) {
    const source = absoluteAddress($(element).attr('src') ?? '', documentUrl)
    if (!source.startsWith('file:')) continue
    const path = localPathOf(source, folder)
    const type = path === undefined ? undefined : IMAGE_TYPES[extname(path).toLowerCase()]
    const bytes = path !== undefined && type !== undefined ? await readIfThere(path) : undefined
    if (bytes === undefined || type === undefined || bytes.length > MAX_IMAGE_BYTES || total + bytes.length > MAX_TOTAL_BYTES) {
      missing += 1
      continue
    }
    total += bytes.length
    inlined += 1
    $(element).attr('src', `data:${type};base64,${bytes.toString('base64')}`)
  }

  return { html: $.html(), inlined, missing }
}
