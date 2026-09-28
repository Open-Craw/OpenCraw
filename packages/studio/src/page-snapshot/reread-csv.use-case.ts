import { HttpClient } from '@opencraw/core'
import type { WorkbookDocument } from '@opencraw/core'

/** `delimiter`/`encoding` on a `grid-view` request overriding what was auto-detected (issue #94's 5c: "the detected delimiter and encoding shown and overridable"); either, both, or neither. */
export interface CsvOverride {
  delimiter?: string
  encoding?:  string
}

/**
 * Re-reads a CSV document with an overridden delimiter and/or encoding
 * (studio plan §3.4, issue #94's 5c). `take-snapshot` already read this same
 * document once with auto-detection (`http.client.ts`'s own `csvWorkbook`
 * call); it keeps only the parsed result, not the raw bytes, so re-reading
 * the file/URL is the only way to apply a different choice — the same
 * "the studio re-fetches, the reader keeps no bytes around" tradeoff
 * `pdf-bytes.use-case.ts` documents for pdf.js.
 *
 * @param url - The document's URL — a `file:` URL or an `http(s):` URL (`page-snapshot`'s cached `SnapshotResult.baseUrl`).
 * @param override - The delimiter and/or encoding to force; `HttpClient` still detects whichever one is left out.
 * @returns The freshly read workbook.
 * @throws Error when the URL cannot be read, or it no longer reads back as a workbook.
 */
export async function rereadCsv (url: string, override: CsvOverride): Promise<WorkbookDocument> {
  const client = await HttpClient.open({})
  try {
    const response = await client.send({ url, as: 'csv', delimiter: override.delimiter, encoding: override.encoding })
    if (response.body.kind !== 'workbook') throw new Error(`rereadCsv: ${url} did not read back as a workbook`)

    return response.body
  } finally {
    await client.dispose()
  }
}
