import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Pages for `allowedHosts`: a page whose script fetches from its own host and
 * from another one (`localhost`, the same server under a name the list leaves
 * out) and opens a web socket to it, JSON both names answer, and a redirect
 * to wherever `to` says.
 */
function allowPage (port: number): string {
  return `<!doctype html><html lang="en"><head><title>Allow</title></head><body>
<p id="own">waiting</p><p id="other">waiting</p><p id="socket">waiting</p>
<script>
  var pending = 3
  function settle (id, text) { document.getElementById(id).textContent = text; pending -= 1; if (pending === 0) document.body.appendChild(Object.assign(document.createElement('p'), { id: 'done', textContent: 'done' })) }
  fetch('/allow/data').then(function (r) { return r.json() }).then(function (d) { settle('own', d.value) }, function () { settle('own', 'blocked') })
  fetch('http://localhost:${port}/allow/data').then(function (r) { return r.json() }).then(function (d) { settle('other', d.value) }, function () { settle('other', 'blocked') })
  var socket = new WebSocket('ws://localhost:${port}/allow/socket')
  socket.onclose = function (event) { settle('socket', String(event.code)) }
</script>
</body></html>`
}

export function allowlistRoute (_incoming: IncomingMessage, outgoing: ServerResponse, url: URL, port: number): boolean {
  switch (url.pathname) {
    case '/allow/page': {
      outgoing.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      outgoing.end(allowPage(port))

      return true
    }
    case '/allow/data': {
      outgoing.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      outgoing.end(JSON.stringify({ value: 'ok' }))

      return true
    }
    case '/allow/redirect': {
      outgoing.writeHead(302, { location: url.searchParams.get('to') ?? '/allow/data' })
      outgoing.end()

      return true
    }
    default: {
      return false
    }
  }
}
