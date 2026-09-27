// A local stand-in for both sides of a paid captcha solve, so the example runs without an account:
// - a search page that shows a reCAPTCHA-shaped challenge until it has been passed, on 127.0.0.1:4581;
// - a fake CapSolver API that answers `createTask` and `getTaskResult` the way the real one does.
// The token the fake API issues is the only one the search page accepts.
import { createServer } from 'node:http'

/** The recipe's start URL names this port: start URLs are not templated. */
export const SITE_PORT = 4581
export const API_KEY = 'demo-key'
const TOKEN = 'demo-token'
const SITE = `http://127.0.0.1:${SITE_PORT}`
const RESULTS = [['Trail runner', 40], ['Rain shell', 55.5], ['Wool beanie', 70]]

const challenge = back => `<!doctype html><html lang="en"><head><title>Are you human?</title></head><body>
<h1>Are you human?</h1><form method="post" action="/verify">
<div class="g-recaptcha" data-sitekey="demo-site-key" style="width:300px;height:78px;border:1px solid #999">I'm not a robot</div>
<textarea name="g-recaptcha-response" style="display:none"></textarea><input type="hidden" name="back" value="${back}">
</form></body></html>`

const results = query => `<!doctype html><html lang="en"><head><title>Results for ${query}</title></head><body>
<h1>Results for "${query}"</h1><ul id="results">${RESULTS.map(([name, price]) => `<li class="item"><span class="name">${name}</span> <span class="price">${price} EUR</span></li>`).join('')}</ul>
</body></html>`

function listen (server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(() => resolve())) }))
  })
}

function readBody (request) {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => resolve(body))
  })
}

/**
 * The search site. `/search?q=` shows the challenge until the `captcha=passed` cookie is set by `/verify`.
 *
 * @returns {Promise<{ url: string, close: () => Promise<void> }>} Its base URL and a way to stop it.
 */
export function startSite () {
  return listen(createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', SITE)
    const html = (body, status = 200) => {
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
      response.end(body)
    }
    if (url.pathname === '/search') {
      const passed = (request.headers.cookie ?? '').includes('captcha=passed')

      return html(passed ? results(url.searchParams.get('q') ?? '') : challenge(`${url.pathname}${url.search}`))
    }
    if (url.pathname === '/verify' && request.method === 'POST') {
      const form = new URLSearchParams(await readBody(request))
      const ok = form.get('g-recaptcha-response') === TOKEN
      response.writeHead(302, { location: form.get('back') ?? '/search', ...(ok && { 'set-cookie': 'captcha=passed; Path=/' }) })

      return response.end()
    }

    return html('Not found', 404)
  }), SITE_PORT)
}

/**
 * A fake CapSolver API on a free port: one `processing` poll, then the token. It checks the client key.
 *
 * @returns {Promise<{ url: string, close: () => Promise<void>, tasks: object[] }>} Its base URL, a way to stop it, and the tasks it was sent.
 */
export async function startFakeCapsolver () {
  const tasks = []
  const polls = new Map()
  const api = await listen(createServer(async (request, response) => {
    const body = JSON.parse(await readBody(request) || '{}')
    const json = (answer) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(answer))
    }
    if (body.clientKey !== API_KEY) return json({ errorId: 1, errorCode: 'ERROR_KEY_DOES_NOT_EXIST', errorDescription: 'Invalid client key' })
    if (request.url === '/createTask') {
      tasks.push(body.task)
      const taskId = `task-${tasks.length}`
      polls.set(taskId, 0)

      return json({ errorId: 0, taskId })
    }
    if (request.url === '/getTaskResult') {
      const seen = polls.get(body.taskId) ?? 0
      polls.set(body.taskId, seen + 1)

      return json(seen === 0 ? { errorId: 0, status: 'processing' } : { errorId: 0, status: 'ready', solution: { gRecaptchaResponse: TOKEN } })
    }

    return json({ errorId: 1, errorCode: 'ERROR_UNKNOWN_METHOD', errorDescription: request.url })
  }), 0)

  return { ...api, tasks }
}
