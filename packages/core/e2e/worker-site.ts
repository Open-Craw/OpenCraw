import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * A report page for worker mode, built like public statistics forms: fixed
 * settings (an axis), a state whose `change` loads its RTO list after a
 * delay, a group filter, and Apply, which fetches the rows. The server counts
 * page loads, so a test can tell a reused page from a reloaded one. The data
 * for an RTO named `BAD` answers 500: the page shows an error, not rows.
 * Good data takes 250 ms.
 */
const WORKER_PAGE = `<!doctype html><html lang="en"><head><title>Report</title></head><body>
<form id="form">
  <select id="axis"><option value="">choose</option><option value="maker">Maker</option><option value="fuel">Fuel</option></select>
  <select id="state" multiple style="display:none"><option value="DL">Delhi</option><option value="GA">Goa</option></select>
  <select id="rto" multiple style="display:none"></select>
  <select id="group" multiple style="display:none"><option value="Bus">Bus</option><option value="Car">Car</option></select>
</form>
<button id="apply" type="button">Apply</button>
<div id="result"></div>
<script>
  var RTOS = { DL: ['DL1', 'DL2', 'BAD'], GA: ['GA1', 'BAD'] }
  document.getElementById('state').addEventListener('change', function (event) {
    var rto = document.getElementById('rto')
    rto.innerHTML = ''
    var chosen = [].filter.call(event.target.options, function (option) { return option.selected })
    if (chosen.length === 1) setTimeout(function () { RTOS[chosen[0].value].forEach(function (code) { rto.add(new Option(code, code)) }) }, 150)
  })
  function picked (id) { return [].filter.call(document.getElementById(id).options, function (option) { return option.selected }).map(function (option) { return option.value }).join(',') }
  document.getElementById('apply').addEventListener('click', function () {
    var result = document.getElementById('result')
    result.innerHTML = ''
    var query = ['axis=' + document.getElementById('axis').value, 'state=' + picked('state'), 'rto=' + picked('rto'), 'group=' + picked('group')].join('&')
    fetch('/worker/data?' + query).then(function (response) {
      if (!response.ok) { result.innerHTML = '<p id="error">failed</p>'; return }
      return response.json().then(function (rows) { result.innerHTML = rows.map(function (row) { return '<p class="row">' + row + '</p>' }).join('') })
    })
  })
</script>
</body></html>`

/** Page loads served since the last reset. */
export const workerSite = { loads: 0 }

export function workerRoute (_incoming: IncomingMessage, outgoing: ServerResponse, url: URL): boolean {
  if (url.pathname === '/worker/report') {
    workerSite.loads += 1
    outgoing.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    outgoing.end(WORKER_PAGE)

    return true
  }
  if (url.pathname === '/worker/data') {
    const get = (name: string): string => url.searchParams.get(name) ?? ''
    if (get('rto') === 'BAD') {
      outgoing.writeHead(500, { 'content-type': 'text/plain' })
      outgoing.end('failed')

      return true
    }
    // A report takes a moment to build, as on a real site.
    setTimeout(() => {
      outgoing.writeHead(200, { 'content-type': 'application/json' })
      outgoing.end(JSON.stringify([`${get('axis')}|${get('state')}|${get('rto')}|${get('group') || 'all'}`]))
    }, 250)

    return true
  }

  return false
}
