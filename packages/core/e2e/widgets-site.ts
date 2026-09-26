import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'

/**
 * Report controls as script-heavy public forms build them: a hidden
 * `<select multiple>` of states (a widget would draw its own overlay) whose
 * `change` loads the RTO list for exactly one state, after a delay; a visible
 * multi-select of fuels; `#picked` shows what the form would post. And export
 * buttons that download a CSV and an Excel file.
 */
const WIDGETS_PAGE = `<!doctype html><html lang="en"><head><title>Filters</title></head><body>
<form id="filters">
  <select id="state" name="state" multiple style="display:none"><option value="DL">Delhi</option><option value="KA">Karnataka</option><option value="MH">Maharashtra</option></select>
  <select id="rto" name="rto" multiple style="display:none"></select>
  <select id="maker" name="maker" multiple style="display:none"><option value="ASHOK LEYLAND">ASHOK LEYLAND</option><option value="BAJAJ AUTO">BAJAJ AUTO</option></select>
  <select id="fuel" name="fuel" multiple><option value="PETROL">Petrol</option><option value="DIESEL">Diesel</option><option value="CNG">CNG</option></select>
</form>
<h1>Filters</h1>
<div id="makerBox"><button type="button" id="makerToggle">Makers</button><div id="makerList" style="display:none"><input id="makerSearch" placeholder="search"></div></div>
<p id="picked"></p>
<a id="csv" href="/widgets/rows.csv">CSV</a> <button id="xlsx" onclick="location.href='/widgets/book.xlsx'">Excel</button>
<script>
  var form = document.getElementById('filters')
  function show () {
    var data = new FormData(form)
    document.getElementById('picked').textContent = ['state', 'rto', 'maker', 'fuel'].map(function (name) { return name + '=' + data.getAll(name).join(',') }).join(';')
  }
  document.getElementById('state').addEventListener('change', function (event) {
    var rto = document.getElementById('rto')
    rto.innerHTML = ''
    var chosen = [].filter.call(event.target.options, function (option) { return option.selected })
    if (chosen.length === 1) setTimeout(function () {
      ['1', '2', '3'].forEach(function (n) { var code = chosen[0].value + n; rto.add(new Option(code + ' - OFFICE ' + n, code)) })
    }, 400)
    show()
  })
  form.addEventListener('change', show)
  // A maker list that loads as you type: a toggle opens it, each search replaces the options (chosen ones kept).
  document.getElementById('makerToggle').addEventListener('click', function () { document.getElementById('makerList').style.display = 'block' })
  document.querySelector('h1').addEventListener('click', function () { document.getElementById('makerList').style.display = 'none' })
  var searching
  document.getElementById('makerSearch').addEventListener('keyup', function (event) {
    clearTimeout(searching)
    var text = event.target.value
    searching = setTimeout(function () {
      fetch('/widgets/makers?search=' + encodeURIComponent(text)).then(function (response) { return response.json() }).then(function (found) {
        var maker = document.getElementById('maker')
        ;[].slice.call(maker.options).forEach(function (option) { if (!option.selected) option.remove() })
        found.forEach(function (name) { if (![].some.call(maker.options, function (option) { return option.value === name })) maker.add(new Option(name, name)) })
      })
    }, 250)
  })
</script></body></html>`

const MAKERS = ['ASHOK LEYLAND', 'BAJAJ AUTO', 'EICHER MOTORS', 'TATA MOTORS LTD', 'TATA MOTORS PASSENGER VEHICLES LTD', 'TVS MOTOR']

export function widgetsRoute (_incoming: IncomingMessage, outgoing: ServerResponse, url: URL): boolean {
  switch (url.pathname) {
    case '/widgets': {
      outgoing.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      outgoing.end(WIDGETS_PAGE)

      return true
    }
    case '/widgets/makers': {
      const text = (url.searchParams.get('search') ?? '').toUpperCase()
      outgoing.writeHead(200, { 'content-type': 'application/json' })
      outgoing.end(JSON.stringify(MAKERS.filter(name => text !== '' && name.includes(text)).slice(0, 5)))

      return true
    }
    case '/widgets/rows.csv': {
      outgoing.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="report-rows.csv"' })
      outgoing.end('maker,total\nTATA MOTORS,130\nHERO,39\n')

      return true
    }
    case '/widgets/book.xlsx': {
      outgoing.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="report.xlsx"' })
      outgoing.end(readFileSync(join(__dirname, '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx')))

      return true
    }
    default: {
      return false
    }
  }
}
