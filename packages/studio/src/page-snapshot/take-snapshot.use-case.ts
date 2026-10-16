import { BrowserClient, HttpClient, sessionStateOf } from '@opencraw/core'
import type { BodyKind, BrowserSessionConfig, HookMap, HttpBody, HttpRequest, InputRecipe } from '@opencraw/core'
import { ensureBrowserLaunch } from '../browser-provisioning'
import { blockedPageNotice } from './blocked-page.algorithm'
import { DISMISS_CONSENT_SCRIPT, MARK_OVERLAYS_SCRIPT } from './consent-banner.algorithm'
import { HIDDEN_ATTRIBUTE, hiddenMarksScript } from './hidden-marks.algorithm'
import { inlineAssets } from './inline-assets.mapper'
import { inlineLocalImages } from './inline-local-images.use-case'
import type { CapturedAsset } from './inline-assets.mapper'
import { rewriteDocument } from './rewrite-document.mapper'

/** How long a cookie banner is given to go away once its button is pressed. */
const CONSENT_SETTLE_MS = 1200
/** A banner appears a moment after the page loads (some only after its scripts have run for a few seconds): it is looked for this many times, this far apart, and a page with none costs this much time. */
const CONSENT_ATTEMPTS = 6
const CONSENT_RETRY_MS = 800

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
  /** Something to tell the person about the page: it is a bot check or an access-denied page, not the content. */
  notice?:   string
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
 * @param hooks - The hooks a login bootstrap may call (the ones Studio was started with, issue #150).
 * @returns The rewritten snapshot.
 * @throws Error when the recipe has no start point, or `stepPath` is not `"start"`.
 */
export async function takeSnapshot (input: InputRecipe, stepPath: string, browser?: BrowserSessionConfig, hooks?: HookMap): Promise<SnapshotResult> {
  if (stepPath !== 'start') throw new Error(`takeSnapshot: "${stepPath}" is not supported yet — only "start" (the first start point, before any step runs) is; see this function's doc comment`)
  const point = input.start[0]
  if (point === undefined) throw new Error(`recipe "${input.id}" has no start point`)

  const storageState = await loginState(input, browser, hooks)

  return input.mode === 'web' ? snapshotWeb(point.url, storageState, browser) : snapshotApi(point.url, storageState, requestedAs(input))
}

/** What the recipe's own login leaves behind, so the snapshot shows the page as the crawl sees it (issue #185); nothing when it declares no login. */
async function loginState (input: InputRecipe, browser?: BrowserSessionConfig, hooks?: HookMap): ReturnType<typeof sessionStateOf> {
  if (input.session === undefined) return undefined
  let client: BrowserClient | undefined
  try {
    return await sessionStateOf(input, {
      hooks,
      browser: async () => {
        client = await ensureBrowserLaunch(browser, () => BrowserClient.launch(browser))

        return client
      },
    })
  } finally {
    await client?.close()
  }
}

async function snapshotWeb (url: string, storageState: Awaited<ReturnType<typeof sessionStateOf>>, browser?: BrowserSessionConfig): Promise<SnapshotResult> {
  const client = await ensureBrowserLaunch(browser, () => BrowserClient.launch(browser))
  try {
    const session = await client.newSession({ storageState })
    try {
      const assets = new Map<string, CapturedAsset>()
      const captures: Promise<void>[] = []
      const budget = { bytes: 0 }
      session.page.on('response', (loaded) => { captures.push(captureAsset(loaded, assets, budget)) })
      const response = await session.page.goto(url)
      // A cookie banner left in place covers the page in this view, and the clicks that pick a value would land on it.
      await dismissConsent(session.page)
      // What still covers the page after that (a modal whose button the script does not know) is left out of the picture: "Show hidden" brings it back.
      await session.page.evaluate(MARK_OVERLAYS_SCRIPT)
      const seen = String(await session.page.evaluate(String.raw`document.title + "\n" + (document.body ? document.body.innerText : "").slice(0, 3000)`))
      await session.page.evaluate(hiddenMarksScript(HIDDEN_ATTRIBUTE))
      await Promise.all(captures)
      const baseUrl = session.page.url()
      // The page's own styles and fonts go inside the picture: the frame that shows it is not the site, so the site's fonts would be refused there.
      const html = inlineAssets(await session.page.content(), baseUrl, assets)
      const rewritten = rewriteDocument(html, baseUrl)
      const notice = blockedPageNotice(seen, response?.status())

      return { ...rewritten, baseUrl, rawHtml: html, ...(notice !== undefined && { notice }) }
    } finally {
      await session.close()
    }
  } finally {
    await client.close()
  }
}

/** The most a stylesheet may weigh to be kept, the most a font may, and how much of both a page may bring (bytes): a picture is not worth a heavier page than this. */
const MAX_CSS_BYTES = 800_000
const MAX_FONT_BYTES = 600_000
const MAX_ASSET_BUDGET = 6_000_000

/** A response, as far as keeping a stylesheet or a font needs it. */
interface LoadedResponse {
  url:     () => string
  request: () => { resourceType: () => string }
  body:    () => Promise<Uint8Array>
}

/** Keeps a stylesheet or a font the page loaded, within the limits above; anything else, or anything that cannot be read, is let go. */
async function captureAsset (loaded: LoadedResponse, assets: Map<string, CapturedAsset>, budget: { bytes: number }): Promise<void> {
  const type = loaded.request().resourceType()
  if (type !== 'stylesheet' && type !== 'font') return
  try {
    const body = await loaded.body()
    if (body.length > (type === 'font' ? MAX_FONT_BYTES : MAX_CSS_BYTES) || budget.bytes + body.length > MAX_ASSET_BUDGET) return
    budget.bytes += body.length
    assets.set(loaded.url(), { kind: type === 'font' ? 'font' : 'css', body })
  } catch {
    // A response that went away before it could be read is not kept.
  }
}

/** How the recipe's own first request reads the document (`as`), so a JSON API served as `text/plain` is shown as JSON here too. */
function requestedAs (input: InputRecipe): HttpRequest['as'] {
  const request = input.steps.find(step => step.type === 'request')

  return request?.type === 'request' ? request.as : undefined
}

/** A page, or a frame of it, as far as the consent script needs it. */
interface ScriptTarget {
  evaluate: (script: string) => Promise<unknown>
}

/**
 * Presses the cookie banner's reject (or accept) button, if the page shows one. Many sites put their consent dialog in a frame of its
 * own (a separate document, often covering the whole window), so every frame is searched, not only the page. The page is looked at
 * a few times, since banners come late.
 */
async function dismissConsent (page: ScriptTarget & { waitForTimeout: (ms: number) => Promise<void>, frames: () => ScriptTarget[] }): Promise<void> {
  for (let attempt = 0; attempt < CONSENT_ATTEMPTS; attempt += 1) {
    for (const frame of page.frames()) {
      let pressed = ''
      try {
        pressed = String(await frame.evaluate(DISMISS_CONSENT_SCRIPT))
      } catch {
        // A frame that went away or is not ready has no banner to press.
      }
      if (pressed !== '') {
        await page.waitForTimeout(CONSENT_SETTLE_MS)

        return
      }
    }
    await page.waitForTimeout(CONSENT_RETRY_MS)
  }
}

async function snapshotApi (url: string, storageState: Awaited<ReturnType<typeof sessionStateOf>>, as?: HttpRequest['as']): Promise<SnapshotResult> {
  const client = await HttpClient.open({ storageState })
  try {
    const response = await client.send({ url, ...(as !== undefined && { as }) })
    const text = textOf(response.body)
    // A document read from a file names its pictures by paths beside it, which the browser cannot open: the ones next to the file are embedded.
    const pictures = await inlineLocalImages(text, url)
    const rewritten = rewriteDocument(pictures.html, url)
    const notice = pictures.missing === 0 ? undefined : `${String(pictures.missing)} picture${pictures.missing === 1 ? '' : 's'} in this document ${pictures.missing === 1 ? 'is' : 'are'} not shown: only pictures kept in the same folder as the file can be.`

    return { ...rewritten, baseUrl: url, rawHtml: text, format: response.format, body: response.body, ...(notice !== undefined && { notice }) }
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
