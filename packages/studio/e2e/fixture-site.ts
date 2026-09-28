import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { BrowserSessionConfig } from '@opencraw/core'

/**
 * A tiny fixture site for the studio's own e2e suite: two products, served
 * as JSON, from `node:http` (no framework, no dependency on the built cli or
 * browser). Deliberately not `packages/core/e2e/fixture-site.ts`: that file
 * sits outside core's public API (e2e code, not a library export) and
 * importing it across packages would be exactly the deep, non-`index.ts`
 * import the vertical-slice rules forbid for `src/`; this is `@opencraw/studio`'s
 * own small copy of the idea, sized to what phase 0's skeleton needs.
 */
export const FIXTURE_PORT = Number(process.env.OPENCRAW_STUDIO_FIXTURE_PORT ?? '4599')
export const FIXTURE_BASE = `http://127.0.0.1:${FIXTURE_PORT}`

export const PRODUCTS = [
  { name: 'Widget', price: 9.5 },
  { name: 'Gadget', price: 14 },
]

/** How many books the listing page has — the picking e2e test's "emits 20 records" (issue #91's deliverable line), echoing books.toscrape.com's own page size. */
export const BOOK_COUNT = 20

/** The Inspect panel e2e test's (#93) three finds, apart from the tree's own picking: a value only in a hidden node, a JSON-LD block, and a JSON response fetched while the page renders. */
export const HIDDEN_PROMO_CODE = 'SECRET-42'
export const JSON_LD_PRICE = 42
export const REVIEWS_PATH = '/api/reviews'
export const REVIEWS_QUERY_PAGE = 1

/**
 * A books.toscrape-shaped listing (studio plan §3.2, issue #91's picking
 * e2e test): `article.product_pod` items, directly inside `div.row` (no
 * extra wrapper — books.toscrape's own markup), each with an `h3 > a` title
 * and a `p.price_color` price, so `packages/studio/e2e/picking.e2e.test.ts`
 * can pick a price twice and get the safe list shape by construction.
 *
 * Also carries the Inspect panel e2e test's (#93) three finds, none of them
 * inside `.row` so `BOOK_COUNT`/`.price_color`/`article.product_pod` counts
 * above are untouched: a hidden `<input>` (a value that never renders), a
 * `<script type="application/ld+json">` block, and an inline `<script>` that
 * fetches a JSON endpoint while the page loads (a real XHR a headless
 * browser observes, the same way `packages/cli`'s `probe --browser` does).
 */
function booksHtml (): string {
  const items = Array.from({ length: BOOK_COUNT }, (_, index) => {
    const id = index + 1

    return `<article class="product_pod"><h3><a href="/book/${id}" title="Book ${id}">Book ${id}</a></h3><p class="price_color">£${(10 + id).toFixed(2)}</p></article>`
  }).join('')
  const hiddenPromo = `<input type="hidden" id="promo-code" value="${HIDDEN_PROMO_CODE}">`
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', 'name': 'Books catalogue', 'price': JSON_LD_PRICE })}</script>`
  const fetchReviews = `<script>fetch(${JSON.stringify(`${REVIEWS_PATH}?page=${REVIEWS_QUERY_PAGE}`)})</script>`

  return `<!doctype html><html lang="en"><head><title>Books</title>${jsonLd}</head><body>${hiddenPromo}<div class="row">${items}</div>${fetchReviews}</body></html>`
}

function handle (request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', FIXTURE_BASE)
  if (url.pathname === '/products') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ items: PRODUCTS }))

    return
  }
  if (url.pathname === '/books') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(booksHtml())

    return
  }
  if (url.pathname === REVIEWS_PATH) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ items: [{ rating: 5 }, { rating: 4 }] }))

    return
  }
  response.writeHead(404, { 'content-type': 'text/plain' })
  response.end('not found')
}

/**
 * Browser settings for a web-mode e2e run (`picking.e2e.test.ts`):
 * `OPENCRAW_CHROMIUM` points at a chromium binary when the one `playwright
 * install` would fetch is not available (a sandbox with a preinstalled
 * browser); unset, Playwright's own browser is used. Mirrors
 * `packages/core/e2e/fixture-site.ts`'s own `browserConfig`.
 */
export function browserConfig (): BrowserSessionConfig {
  const executablePath = process.env.OPENCRAW_CHROMIUM

  return executablePath === undefined || executablePath === '' ? {} : { executablePath }
}

/** Starts the fixture site on its fixed port. */
export async function startFixtureSite (): Promise<Server> {
  const server = createServer(handle)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(FIXTURE_PORT, '127.0.0.1', resolve)
  })

  return server
}

/** Stops the site, dropping any keep-alive connections so the close completes. */
export async function stopFixtureSite (server: Server | undefined): Promise<void> {
  if (server === undefined) return
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => { server.close(error => (error === undefined ? resolve() : reject(error))) })
}
