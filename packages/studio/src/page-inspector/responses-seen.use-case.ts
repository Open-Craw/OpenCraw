import { BrowserClient, tryParseJson } from '@opencraw/core'
import type { BrowserSessionConfig, InputRecipe } from '@opencraw/core'
import { describeJson } from '@opencraw/probe'
import { ensureBrowserLaunch } from '../browser-provisioning'
import type { Response as PlaywrightResponse } from 'playwright'

/** How long the browser is given to settle after `goto`, watching for JSON responses (mirrors `packages/cli`'s `probe --browser`, `observeBrowserJson`). */
const OBSERVE_MS = 4000
/** Responses kept, largest/most-recent-first ordering left to the caller; just a sane cap on what the panel lists. */
const RESPONSE_LIMIT = 15

/** One JSON response the page fetched while it rendered (studio plan §3.3, issue #93): what "responses seen" lists, and what picking one switches the recipe to api mode on. */
export interface ObservedResponse {
  url:    string
  status: number
  /** The response body's size in bytes (its UTF-8 text length). */
  size:   number
  /** The top-level shape (`describeJson`'s own `type`: `"object"`, `"array (12) of object"`…), or `"text"` when the body did not parse as JSON despite its content type. */
  shape:  string
}

/**
 * Records the JSON responses seen while an input recipe's start page
 * rendered (studio plan §3.3, issue #93): the same technique `packages/cli`'s
 * `probe --browser` uses (`observeBrowserJson`) — render the page, listen for
 * `response` events whose content type is JSON, give it a few seconds to
 * settle. Kept as its own capture, independent of `page-snapshot`'s
 * `take-snapshot.use-case.ts`: that capture reads `page.content()` right
 * after `goto` resolves, with no observation window, and changing its shape
 * to also collect responses was a larger, riskier change to already-shipped,
 * tested code than this phase's budget allowed (see this phase's final
 * report) — so this opens its own short-lived browser session instead of
 * piggy-backing on the cached snapshot.
 *
 * Only `"start"` is supported, mirroring `take-snapshot.use-case.ts`'s own
 * reach; api-mode recipes have no page load to observe, so they always
 * answer with an empty list rather than an error (there is nothing wrong
 * with asking, the answer is just "none").
 *
 * @param input - The input recipe; only `mode` and the first `start` point are used.
 * @param stepPath - The step to observe after, e.g. `"start"`.
 * @param browser - Browser launch settings, shared with `take-snapshot`/`verify-selector`/`run-sample`.
 * @returns The distinct JSON responses observed, at most `RESPONSE_LIMIT`.
 * @throws Error when the recipe has no start point, or `stepPath` is not `"start"`.
 */
export async function responsesSeen (input: InputRecipe, stepPath: string, browser?: BrowserSessionConfig): Promise<ObservedResponse[]> {
  if (stepPath !== 'start') throw new Error(`responsesSeen: "${stepPath}" is not supported yet — only "start" (the first start point, before any step ran) is`)
  if (input.mode !== 'web') return []
  const point = input.start[0]
  if (point === undefined) throw new Error(`recipe "${input.id}" has no start point`)

  const client = await ensureBrowserLaunch(browser, () => BrowserClient.launch(browser))
  try {
    const session = await client.newSession()
    try {
      const responses: ObservedResponse[] = []
      const seen = new Set<string>()
      const pending: Promise<void>[] = []
      session.page.on('response', (response) => {
        if (!(response.headers()['content-type'] ?? '').includes('json')) return
        const key = `${response.status()} ${response.url()}`
        if (seen.has(key)) return
        seen.add(key)
        pending.push(recordResponse(response, responses))
      })
      try {
        await session.page.goto(point.url, { waitUntil: 'networkidle' })
      } catch {
        // a page that never idles (long-poll, websocket) still yields whatever was observed by the timeout below
      }
      await session.page.waitForTimeout(OBSERVE_MS)
      await Promise.all(pending)

      return responses.slice(0, RESPONSE_LIMIT)
    } finally {
      await session.close()
    }
  } finally {
    await client.close()
  }
}

/** Reads one response's body, when it still can be (not aborted, not redirected away); a response that cannot be read is silently left out rather than failing the whole capture. */
async function recordResponse (response: PlaywrightResponse, into: ObservedResponse[]): Promise<void> {
  try {
    const body = await response.text()
    const value = tryParseJson(body)
    into.push({ url: response.url(), status: response.status(), size: body.length, shape: value === undefined ? 'text' : describeJson(value, 'json').type })
  } catch {
    // response body unavailable (aborted, redirected, the page navigated away) — skip it
  }
}
