import { BrowserClient, HttpClient } from '@opencraw/core'
import type { BrowserSessionConfig, HttpBody, InputRecipe } from '@opencraw/core'
import { ensureBrowserLaunch } from '../browser-provisioning'

/**
 * Fetches an input recipe's start page as the engine would see it: a fresh
 * Playwright page in web mode, core's HTTP client in api mode. Returns plain
 * text: the page's HTML, or a readable rendering of a non-HTML api response.
 * No rewriting, no script stripping, no node ids yet: that is phase 2's
 * `page-snapshot` proper (studio plan, #91). Provisional for phase 0 in two
 * ways, both worth knowing before relying on it: it opens a bare page
 * without running the recipe's own steps first, so a start point behind a
 * `session.bootstrap` login shows what an anonymous visitor sees; and it
 * launches a fresh browser or HTTP context per call, one page then closes
 * it, rather than reusing whatever the last sample run had open.
 *
 * @param input - The input recipe; only `mode` and the first `start` point are used.
 * @param browser - Browser launch settings for web mode (an executable path override, headless…).
 * @returns The page's content as plain text.
 * @throws Error when the recipe has no start point.
 */
export async function fetchStartPage (input: InputRecipe, browser?: BrowserSessionConfig): Promise<string> {
  const point = input.start[0]
  if (point === undefined) throw new Error(`recipe "${input.id}" has no start point`)

  return input.mode === 'web' ? fetchWeb(point.url, browser) : fetchApi(point.url)
}

async function fetchWeb (url: string, browser?: BrowserSessionConfig): Promise<string> {
  const client = await ensureBrowserLaunch(browser, () => BrowserClient.launch(browser))
  try {
    const session = await client.newSession()
    try {
      await session.page.goto(url)

      return await session.page.content()
    } finally {
      await session.close()
    }
  } finally {
    await client.close()
  }
}

async function fetchApi (url: string): Promise<string> {
  const client = await HttpClient.open({})
  try {
    const response = await client.send({ url })

    return textOf(response.body)
  } finally {
    await client.dispose()
  }
}

/** Every body kind the studio can show as text today; others get a placeholder rather than a crash. */
function textOf (body: HttpBody): string {
  if (body.kind === 'html') return body.html
  if (body.kind === 'text') return body.text
  if (body.kind === 'json') return JSON.stringify(body.data, null, 2)

  return `[${body.kind} document: the content pane shows HTML and JSON responses for now]`
}
