import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { detectUrlKind } from './detect-url.use-case'

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')
const ROUTES: Record<string, { type: string, body: string | Buffer, disposition?: string }> = {
  '/json':        { type: 'application/json', body: '{"a":1}' },
  '/plain-json':  { type: 'text/plain; charset=utf-8', body: '{"result":"ok","data":{"list":[1,2]}}' },
  '/plain-array': { type: 'text/plain', body: ' [1, 2, 3]' },
  '/page':        { type: 'text/html', body: '<html><body>{"not":"json"}</body></html>' },
  '/words':       { type: 'text/plain', body: 'hello {world}' },
  '/file.pdf':    { type: 'application/pdf', body: PDF, disposition: 'attachment; filename=file.pdf' },
  '/download':    { type: 'application/octet-stream', body: PDF, disposition: 'attachment; filename=report.pdf' },
  '/data.csv':    { type: 'text/csv', body: 'a,b\n1,2\n' },
  '/generator':   { type: 'application/octet-stream;charset=utf-8', body: 'Title,CPI\n"CDID","D7G7"\n', disposition: 'attachment; filename=series.csv' },
  '/README.md':   { type: 'text/plain; charset=utf-8', body: '# A readme\n\nSome words.\n' },
}

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((request, response) => {
    const route = ROUTES[(request.url ?? '').split('?', 1)[0]]
    if (route === undefined) {
      response.writeHead(404).end()

      return
    }
    response.writeHead(200, { 'content-type': route.type, ...(route.disposition !== undefined && { 'content-disposition': route.disposition }) }).end(route.body)
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address() as AddressInfo
  base = `http://127.0.0.1:${String(port)}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => { resolve() })
  })
})

describe('detectUrlKind', () => {
  it('knows JSON by its content type, and by its body when the API serves it as text', async () => {
    expect(await detectUrlKind(`${base}/json`)).toBe('json')
    expect(await detectUrlKind(`${base}/plain-json`)).toBe('json')
    expect(await detectUrlKind(`${base}/plain-array`)).toBe('json')
  })

  it('tells a page from the documents the engine reads: PDF, CSV (also behind a download), Markdown', async () => {
    expect(await detectUrlKind(`${base}/page`)).toBe('html')
    expect(await detectUrlKind(`${base}/file.pdf`)).toBe('pdf')
    expect(await detectUrlKind(`${base}/download`)).toBe('pdf')
    expect(await detectUrlKind(`${base}/data.csv`)).toBe('csv')
    expect(await detectUrlKind(`${base}/generator?format=csv`)).toBe('csv')
    expect(await detectUrlKind(`${base}/README.md`)).toBe('markdown')
  })

  it('knows the address of a YouTube video without fetching it, and leaves its channel and playlist pages to the browser', async () => {
    expect(await detectUrlKind('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe('youtube')
    expect(await detectUrlKind('https://youtu.be/jNQXAC9IVRw')).toBe('youtube')
    expect(await detectUrlKind('https://www.youtube.com/shorts/jNQXAC9IVRw')).toBe('youtube')
    expect(await detectUrlKind('https://www.youtube.com/@channel')).not.toBe('youtube')
  })

  it('leaves plain words as text', async () => {
    expect(await detectUrlKind(`${base}/words`)).toBe('text')
  })

  it('is unknown for an address that cannot be reached', async () => {
    expect(await detectUrlKind('http://127.0.0.1:1/nothing')).toBe('unknown')
  })
})
