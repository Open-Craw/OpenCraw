import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Pages whose navigations a step causes, for the checks a click's navigation
 * goes through:
 *
 * - `/nav/listing?key=…&page=N`: three pages of two items with an `a.next`
 *   link. Page 2 fails its first `fail` hits per `key` (`mode=status` answers
 *   503, `mode=reset` drops the connection), then loads.
 * - `/nav/client`: three pages of items a `button.next` swaps in place, no navigation.
 * - `/nav/endless`: a feed that adds items on every scroll, so it never stops growing.
 * - `/nav/jump`: a jump menu, a `<select>` whose change navigates.
 */

const PAGES = 3

/** Hits on page 2 per key. */
const pageTwoHits = new Map<string, number>()

function html (outgoing: ServerResponse, body: string, status = 200): void {
  outgoing.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  outgoing.end(`<!doctype html><html lang="en"><head><title>Nav</title></head><body>${body}</body></html>`)
}

function items (page: number): string {
  return [1, 2].map(index => `<li class="item">Item ${page}-${index}</li>`).join('')
}

function listing (incoming: IncomingMessage, outgoing: ServerResponse, url: URL): void {
  const page = Number(url.searchParams.get('page') ?? '1')
  if (page === 2) {
    const key = url.searchParams.get('key') ?? ''
    const hits = (pageTwoHits.get(key) ?? 0) + 1
    pageTwoHits.set(key, hits)
    if (hits <= Number(url.searchParams.get('fail') ?? '0')) {
      if (url.searchParams.get('mode') === 'reset') {
        incoming.socket.destroy()

        return
      }
      outgoing.writeHead(503, { 'content-type': 'text/plain' })
      outgoing.end('try later')

      return
    }
  }
  const next = new URL(url)
  next.searchParams.set('page', String(page + 1))
  html(outgoing, `<h1>Page ${page}</h1><ul>${items(page)}</ul>${page < PAGES ? `<a class="next" href="${next.pathname}${next.search}">next</a>` : ''}`)
}

const CLIENT = `<h1 id="title">Page 1</h1><ul id="list">${items(1)}</ul><button class="next">next</button>
<script>
  let page = 1
  const button = document.querySelector('.next')
  button.addEventListener('click', () => {
    page += 1
    document.getElementById('title').textContent = 'Page ' + page
    document.getElementById('list').innerHTML = [1, 2].map(index => '<li class="item">Item ' + page + '-' + index + '</li>').join('')
    if (page >= ${PAGES}) button.remove()
  })
</script>`

const ENDLESS = `<ul id="feed"></ul>
<script>
  let count = 0
  const add = (n) => { for (let i = 0; i < n; i += 1) { count += 1; const li = document.createElement('li'); li.className = 'item'; li.style.height = '40px'; li.textContent = 'Item ' + count; document.getElementById('feed').appendChild(li) } }
  add(40)
  window.addEventListener('scroll', () => add(10))
</script>`

const JUMP = '<select id="jump" onchange="location.href = this.value"><option value="">Go to…</option><option value="/nav/listing?page=3">Page 3</option></select>'

export function navigationRoute (incoming: IncomingMessage, outgoing: ServerResponse, url: URL): boolean {
  switch (url.pathname) {
    case '/nav/listing': { listing(incoming, outgoing, url)

      return true
    }
    case '/nav/client': { html(outgoing, CLIENT)

      return true
    }
    case '/nav/endless': { html(outgoing, ENDLESS)

      return true
    }
    case '/nav/jump': { html(outgoing, JUMP)

      return true
    }
    default: { return false
    }
  }
}
