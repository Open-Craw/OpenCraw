import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveStatic } from './static-file.handler'

async function requestBody (server: Server, path: string): Promise<{ status: number, body: string }> {
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address !== null ? address.port : 0)
    })
  })
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  const body = await response.text()
  server.close()

  return { status: response.status, body }
}

describe('serveStatic', () => {
  it('serves an existing file with its content type', async () => {
    const root = mkdtempSync(join(tmpdir(), 'opencraw-ui-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><html></html>')
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)')
    const server = createServer((request, response) => { serveStatic(root, new URL(request.url ?? '/', 'http://x').pathname, response) })

    const asset = await requestBody(server, '/assets/app.js')
    expect(asset.status).toBe(200)
    expect(asset.body).toBe('console.log(1)')
  })

  it('falls back to index.html for an unknown path (client-side routing)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'opencraw-ui-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>studio</title>')
    const server = createServer((request, response) => { serveStatic(root, new URL(request.url ?? '/', 'http://x').pathname, response) })

    const page = await requestBody(server, '/some/client/route')
    expect(page.status).toBe(200)
    expect(page.body).toContain('<title>studio</title>')
  })

  it('answers 404 with a build hint when the UI has not been built', async () => {
    const root = mkdtempSync(join(tmpdir(), 'opencraw-ui-empty-'))
    const server = createServer((request, response) => { serveStatic(root, new URL(request.url ?? '/', 'http://x').pathname, response) })

    const page = await requestBody(server, '/')
    expect(page.status).toBe(404)
    expect(page.body).toContain('build studio-ui')
  })

  it('does not let a path escape the root with ".."', async () => {
    const root = mkdtempSync(join(tmpdir(), 'opencraw-ui-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>safe</title>')
    const server = createServer((request, response) => { serveStatic(root, new URL(request.url ?? '/', 'http://x').pathname, response) })

    const page = await requestBody(server, '/../../etc/passwd')
    expect(page.body).toContain('<title>safe</title>')
  })
})
