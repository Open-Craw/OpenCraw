import { BrowserClient, HttpClient } from '@opencraw/core'
import type { BodyKind, BrowserSessionConfig, HttpBody, InputRecipe } from '@opencraw/core'
import { ensureBrowserLaunch } from '../browser-provisioning'
import { HIDDEN_ATTRIBUTE, hiddenMarksScript } from './hidden-marks.algorithm'
import { rewriteDocument } from './rewrite-document.mapper'

export interface SnapshotResult {
  /** The rewritten document, ready for the content pane's sandboxed iframe. */
  html:      string
  /** How many elements carry a `data-oc-node` id. */
  nodeCount: number
  /** The page's own URL, used to resolve every relative URL and as the `<base>`. */
  baseUrl:   string
  /**
   * The document as captured, before `rewriteDocument` strips every
   * `<script>` for the sandboxed iframe — server-side only, never sent to the
   * UI (`studio-api`'s `SnapshotView` does not carry it): `page-inspector`'s
   * `page-data.algorithm.ts` (issue #93) needs the JSON-LD, inline state and
   * `application/json` blocks a script tag can hold, which the display
   * snapshot no longer has by the time it is cached.
   */
  rawHtml:   string
  /**
   * The format `http.client.ts` read the body as (api mode only; `undefined`
   * in web mode, whose document is always HTML) — what the content pane
   * uses to pick a canvas: `document-view`'s tree/pdf/grid/deck for
   * `json`/`yaml`/`xml`/`pdf`/`csv`/`xlsx`/`pptx`, the snapshot iframe for
   * `html` (and `docx`/`markdown`, which `http.client.ts` already turns into
   * HTML), studio plan §3.4, issue #94.
   */
  format?:   BodyKind
  /**
   * The parsed body itself (api mode only), for `document-view`'s mappers to
   * read — server-side only, never sent to the UI as-is (`studio-api`'s
   * `SnapshotView` carries only `format`; a canvas asks for its own view
   * model with a follow-up command, `inspect-page`'s own pattern).
   */
  body?:     HttpBody
}

/**
 * Captures the snapshot the content pane shows (studio plan §3.1, issue
 * #91): runs the recipe up to `stepPath`, serialises the document, marks
 * hidden elements in web mode, and hands it to `rewrite-document.mapper.ts`
 * for display.
 *
 * `stepPath` is accepted (and cached against, by `snapshot.store.ts`) for
 * the API the UI needs — one snapshot per selected step — but v1 only
 * actually *captures* `"start"`: the first `start` point, before any step
 * of the recipe has run, the same reach `fetch-start-page.use-case.ts` (phase
 * 0) already had. Snapshotting mid-recipe (after an arbitrary later step)
 * needs a "stop the crawl after step X and hand back the live page/document"
 * hook in `crawl-execution` that does not exist yet; building one was out of
 * this phase's budget (see this phase's final report for the tradeoff this
 * was weighed against). Any other `stepPath` throws, clearly, rather than
 * silently returning the start page under a misleading label.
 *
 * @param input - The input recipe; only `mode` and the first `start` point are used.
 * @param stepPath - The step to snapshot after, e.g. `"start"` or `"steps.2"` (`scope-outline`'s path format).
 * @param browser - Browser launch settings for web mode.
 * @returns The rewritten snapshot.
 * @throws Error when the recipe has no start point, or `stepPath` is not `"start"`.
 */
export async function takeSnapshot (input: InputRecipe, stepPath: string, browser?: BrowserSessionConfig): Promise<SnapshotResult> {
  if (stepPath !== 'start') throw new Error(`takeSnapshot: "${stepPath}" is not supported yet — only "start" (the first start point, before any step runs) is; see this function's doc comment`)
  const point = input.start[0]
  if (point === undefined) throw new Error(`recipe "${input.id}" has no start point`)

  return input.mode === 'web' ? snapshotWeb(point.url, browser) : snapshotApi(point.url)
}

async function snapshotWeb (url: string, browser?: BrowserSessionConfig): Promise<SnapshotResult> {
  const client = await ensureBrowserLaunch(browser, () => BrowserClient.launch(browser))
  try {
    const session = await client.newSession()
    try {
      await session.page.goto(url)
      await session.page.evaluate(hiddenMarksScript(HIDDEN_ATTRIBUTE))
      const html = await session.page.content()
      const baseUrl = session.page.url()
      const rewritten = rewriteDocument(html, baseUrl)

      return { ...rewritten, baseUrl, rawHtml: html }
    } finally {
      await session.close()
    }
  } finally {
    await client.close()
  }
}

async function snapshotApi (url: string): Promise<SnapshotResult> {
  const client = await HttpClient.open({})
  try {
    const response = await client.send({ url })
    const text = textOf(response.body)
    const rewritten = rewriteDocument(text, url)

    return { ...rewritten, baseUrl: url, rawHtml: text, format: response.format, body: response.body }
  } finally {
    await client.dispose()
  }
}

/** Every body kind the studio can show as text today; others get a placeholder rather than a crash (mirrors `fetch-start-page.use-case.ts`'s own `textOf`). */
function textOf (body: HttpBody): string {
  if (body.kind === 'html') return body.html
  if (body.kind === 'text') return body.text
  if (body.kind === 'json') return `<pre>${JSON.stringify(body.data, null, 2)}</pre>`

  return `<p>[${body.kind} document: the content pane shows HTML and JSON responses for now]</p>`
}
