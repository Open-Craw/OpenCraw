import { REPORT_LOGO_SVG } from './report-logo.config'
import { cellText } from './table.mapper'
import type { ExportTable, TableCell, TableColumn } from './table.mapper'

/** What the report says about itself. */
export interface ReportOptions {
  /** The output recipe's id: the report's title. */
  title:        string
  description?: string
  /** When the report was made; the moment of writing unless given (tests give one). */
  generatedAt?: Date
}

function escapeHtml (text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** A value that is a web address becomes a link; anything else is the text. Only http and https are linked, never a script address. */
function cellHtml (cell: TableCell): string {
  const text = cellText(cell)
  if (typeof cell === 'string' && /^https?:\/\/\S+$/i.test(text)) return `<a href="${escapeHtml(text)}" target="_blank" rel="noreferrer noopener">${escapeHtml(text)}</a>`

  return escapeHtml(text)
}

function headerHtml (column: TableColumn): string {
  const title = [column.type, column.description].filter(Boolean).join(': ')

  return `<th scope="col"${title === '' ? '' : ` title="${escapeHtml(title)}"`}>${escapeHtml(column.name)}</th>`
}

const STYLE = `
:root{color-scheme:light dark;--bg:#faf9fc;--card:#fff;--fg:#1f1b26;--muted:#6b6577;--line:#e1dde7;--brand:#6f2fda;--brand-soft:#f1eafc;--head:#6f2fda;--head-fg:#fff;--zebra:#f7f4fb}
@media (prefers-color-scheme:dark){:root{--bg:#17141d;--card:#1f1b26;--fg:#ece9f2;--muted:#a59fb3;--line:#352f40;--brand:#a98bf0;--brand-soft:#2a2238;--head:#4a2a93;--head-fg:#fff;--zebra:#231e2c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--line);background:var(--card)}
header svg{flex:none}
header .brand{font-weight:700;letter-spacing:.2px;color:var(--brand)}
main{padding:20px 24px 40px}
h1{margin:0 0 4px;font-size:22px}
.description{margin:0 0 6px;color:var(--muted)}
.meta{margin:0 0 16px;color:var(--muted);font-size:13px}
.meta b{color:var(--fg)}
.scroller{overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:max-content}
th,td{padding:8px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{position:sticky;top:0;background:var(--head);color:var(--head-fg);font-weight:600;white-space:nowrap}
tbody tr:nth-child(even){background:var(--zebra)}
tbody tr:hover{background:var(--brand-soft)}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td a{color:var(--brand);word-break:break-all}
td{max-width:520px;overflow-wrap:anywhere}
.empty{padding:28px;text-align:center;color:var(--muted)}
footer{padding:0 24px 24px;color:var(--muted);font-size:12px}
@media print{@page{size:A4 landscape;margin:12mm}body{background:#fff;color:#000;font-size:10px}header{padding:0 0 8px;border:0;background:none}main{padding:8px 0}.scroller{border:0;overflow:visible}table{min-width:0}th{position:static;-webkit-print-color-adjust:exact;print-color-adjust:exact}td{max-width:none}tbody tr:nth-child(even){background:#f4f1f8;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}thead{display:table-header-group}}
`

/**
 * The table as one self-contained page that looks like Studio: the OpenCraw logo, the output's name and description, how many records and when,
 * and the records in a table with a violet header, zebra rows and numbers on the right. It follows the reader's light or dark setting, scrolls
 * sideways on a screen and fits the paper when printed. No script, no outside file: it can be mailed or archived as it is.
 *
 * @param table - The table.
 * @param options - The title, description and time.
 * @returns The page's HTML.
 */
export function htmlReport (table: ExportTable, options: ReportOptions): string {
  const generated = (options.generatedAt ?? new Date()).toISOString().replace('T', ' ').slice(0, 16)
  const numeric = table.columns.map((_column, index) => table.rows.length > 0 && table.rows.every(row => typeof row[index] === 'number' || row[index] === ''))
  const head = `<tr>${table.columns.map(column => headerHtml(column)).join('')}</tr>`
  const body = table.rows.map(row => `<tr>${row.map((cell, index) => `<td${numeric[index] ? ' class="num"' : ''}>${cellHtml(cell)}</td>`).join('')}</tr>`).join('\n')
  const records = `${String(table.rows.length)} record${table.rows.length === 1 ? '' : 's'}`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)} - OpenCraw</title>
<style>${STYLE}</style>
</head>
<body>
<header>${REPORT_LOGO_SVG}<span class="brand">OpenCraw</span></header>
<main>
<h1>${escapeHtml(options.title)}</h1>
${options.description === undefined ? '' : `<p class="description">${escapeHtml(options.description)}</p>`}
<p class="meta"><b>${records}</b> · ${String(table.columns.length)} field${table.columns.length === 1 ? '' : 's'} · made ${generated} UTC</p>
${table.rows.length === 0
    ? '<div class="scroller"><p class="empty">No records in this run.</p></div>'
    : `<div class="scroller"><table>\n<thead>${head}</thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`}
</main>
<footer>Made with OpenCraw</footer>
</body>
</html>
`
}
