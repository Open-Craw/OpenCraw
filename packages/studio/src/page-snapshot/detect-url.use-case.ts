import { formatOfResponse } from '@opencraw/core'

/** How much of the start of a response is looked at: enough for the engine to tell a PDF or an Office package from its bytes, and for JSON to start. */
const LOOKED_AT_BYTES = 65_536
/** How long to wait for an address to start answering. */
const TIMEOUT_MS = 20_000

/** What an address returns, in the engine's own words (`html` is a page; anything else is a document it reads), or `unknown` when it cannot be fetched. */
export type UrlKind = 'html' | 'json' | 'jsonl' | 'text' | 'pdf' | 'csv' | 'xlsx' | 'pptx' | 'yaml' | 'markdown' | 'xml' | 'docx' | 'unknown'

/**
 * What an address returns: the format the engine reads its response as (content type, then what the first bytes
 * show, then the file extension in the address), and, for an API that serves JSON as `text/plain` (common), JSON when
 * the text starts like an object or an array. Only the start of the response is read: a large file is not downloaded.
 * An address that cannot be fetched is `unknown`; the recipe started from it then reports why on its first snapshot.
 *
 * @param url - The address.
 * @returns The kind: `html` is a page to open in a browser, anything else a document to read.
 */
export async function detectUrlKind (url: string): Promise<UrlKind> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; OpenCrawStudio)', 'accept': '*/*' } })
    const bytes = await firstBytes(response)
    const named = downloadName(response.headers.get('content-disposition'))
    const where = named === undefined ? (response.url === '' ? url : response.url) : `https://download.invalid/${named}`
    const format = formatOfResponse(response.headers.get('content-type') ?? '', where, bytes, response.ok)
    if (format === 'text' && /^[[{]/.test(new TextDecoder().decode(bytes).trimStart())) return 'json'

    return format
  } catch {
    return 'unknown'
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/** The first bytes of a response body; the rest is never downloaded. */
async function firstBytes (response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (reader === undefined) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  while (length < LOOKED_AT_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.length
  }
  try {
    await reader.cancel()
  } catch {
    // The rest of the body was not wanted anyway.
  }

  return Buffer.concat(chunks)
}

/** The file name a download is offered under (`Content-Disposition: attachment; filename=series.csv`): an address like `/generator?format=csv` says nothing about it. */
function downloadName (disposition: string | null): string | undefined {
  return disposition === null ? undefined : /filename=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]?.trim()
}
