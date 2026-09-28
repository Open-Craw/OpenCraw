import { createReadStream, existsSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import type { ServerResponse } from 'node:http'

const MIME: Record<string, string> = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.mjs':   'text/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * Serves the built UI from `root` (`packages/studio/dist/ui`, `apps/studio-ui`'s
 * build output): the requested path if it exists as a file, `index.html`
 * otherwise, so a client-side route (or the bare `/`) always gets the SPA's
 * shell. `root` not existing at all (the UI has not been built) answers 404
 * with a hint rather than a stack trace.
 *
 * @param root - The built UI's folder.
 * @param pathname - The request's URL path.
 * @param response - The response to write to.
 */
export function serveStatic (root: string, pathname: string, response: ServerResponse): void {
  const safe = normalize(pathname).split(sep).filter(segment => segment !== '..').join(sep)
  const candidate = join(root, safe)
  const file = safe !== '' && safe !== sep && existsSync(candidate) ? candidate : join(root, 'index.html')
  if (!existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('the studio UI has not been built yet: run `nx build studio-ui`')

    return
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
}
