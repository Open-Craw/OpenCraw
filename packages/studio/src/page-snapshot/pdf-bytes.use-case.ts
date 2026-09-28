import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Fetches a PDF's raw bytes for the PDF canvas's `pdf.js` to render in the
 * browser (studio plan §3.4, issue #94's 5b: "the PDF bytes served by the
 * studio"). `take-snapshot` already read this same document with
 * `@opencraw/core`'s `readPdf` for the cells/rows `document-view` maps, but
 * `HttpClient`/`readPdf` parse the bytes and keep only the result — pdf.js
 * needs the file itself, so this re-fetches it from the same URL a cached
 * snapshot's own `SnapshotResult.baseUrl` gives, the way `HttpClient`'s own
 * `file:` branch (`readLocalFile`) and its HTTP fetch do.
 *
 * @param url - The document's URL — a `file:` URL or an `http(s):` URL.
 * @returns The raw bytes.
 * @throws Error when a `file:` URL cannot be read, or the fetch does not succeed.
 */
export async function pdfBytes (url: string): Promise<Uint8Array> {
  if (url.startsWith('file:')) return new Uint8Array(await readFile(fileURLToPath(url)))
  const response = await fetch(url)
  if (!response.ok) throw new Error(`pdfBytes: ${String(response.status)} fetching ${url}`)

  return new Uint8Array(await response.arrayBuffer())
}
