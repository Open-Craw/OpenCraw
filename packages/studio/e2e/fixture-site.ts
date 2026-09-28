import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

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

function handle (request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', FIXTURE_BASE)
  if (url.pathname === '/products') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ items: PRODUCTS }))

    return
  }
  response.writeHead(404, { 'content-type': 'text/plain' })
  response.end('not found')
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
