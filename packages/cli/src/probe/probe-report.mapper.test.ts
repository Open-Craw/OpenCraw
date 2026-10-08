import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { csvWorkbook, HttpClient, parseXml, readMarkdown } from '@opencraw/core'
import { describeDeck, describeHtml, describeJson, describeWorkbook, describeXml, findData } from '@opencraw/probe'
import { deckReport, jsonReport, probeReport, workbookReport, xmlReport } from './probe-report.mapper'

// The fixture holds Windows-1252 bytes 0x80 (€) and 0x96 (–). Decoded by hand: some Node builds' TextDecoder('windows-1252') is plain Latin-1 (issue #131).
function windows1252Text (bytes: Buffer): string {
  return bytes.toString('latin1').replaceAll('', '€').replaceAll('', '–')
}

// The findings mappers' own shape is exercised by @opencraw/probe's tests (they moved there with the
// code, #93); these tests are `probe-report.mapper`'s own: given a findings result, does the printed
// report read right. They lived beside the findings mappers' tests before the extraction, so each one
// here mirrors an assertion that used to sit in the matching `*-findings.mapper.test.ts`.

describe('probeReport', () => {
  it('renders a report with only the non-empty sections', () => {
    const fixture = join(__dirname, '..', '..', '..', 'probe', 'src', 'probe', 'fixtures', 'car-config.html')
    const html = readFileSync(fixture, 'utf8')
    const report = probeReport('https://x/config', 200, findData(html))
    expect(report).toContain('https://x/config (HTTP 200)')
    expect(report).toContain('.json URLs referenced:')
    expect(report).not.toContain('JSON-LD blocks:')
    const withObserved = probeReport('https://x', 200, findData(''), ['200 https://x/api/data.json'])
    expect(withObserved).toContain('JSON responses observed in the browser:')
  })

  it('includes an HTML document\'s outlined sections, Markdown rendered', async () => {
    const text = readFileSync(join(__dirname, '..', '..', '..', 'core', 'src', 'markdown-document', 'fixtures', 'listino.md'), 'utf8')
    const { html } = await readMarkdown(text, 'listino.md')
    const findings = describeHtml(html, true)
    const report = probeReport('listino.md', 200, findData(html), [], findings)
    expect(report).toContain("    section[data-heading='Prezzi' i]")
  })
})

describe('jsonReport', () => {
  it('names the format on its first line', () => {
    const findings = describeJson([{ a: 1 }, { a: 2 }], 'jsonl')
    expect(jsonReport('x.jsonl', findings).split('\n', 1)[0]).toBe('x.jsonl (JSON Lines: array (2) of object)')
  })
})

describe('workbookReport', () => {
  it('names the encoding and the delimiter, and lists headers before rows', () => {
    const bytes = readFileSync(join(__dirname, '..', '..', '..', 'core', 'src', 'workbook-document', 'fixtures', 'listino.csv'))
    const listino = csvWorkbook(windows1252Text(bytes), { name: 'listino', encoding: 'windows-1252' })
    const report = workbookReport('http://x/listino.csv', describeWorkbook(listino))
    expect(report.split('\n', 1)[0]).toBe('http://x/listino.csv (CSV, windows-1252, delimited by semicolons)')
    expect(report).toContain('  listino r3  ^Marca\n        Marca | Modello | Versione | Prezzo € | Sconto %')
    expect(report.indexOf('Likely table headers')).toBeLessThan(report.indexOf('First rows'))
  })
})

describe('deckReport', () => {
  it('lists the text-box grids found', async () => {
    const fixture = join(__dirname, '..', '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')
    const client = await HttpClient.open()
    try {
      const { body } = await client.send({ url: pathToFileURL(fixture).href })
      if (body.kind !== 'deck') throw new Error(`read as ${body.kind}`)
      const findings = describeDeck(body)
      expect(deckReport('x.pptx', findings)).toContain('slide 2  Griglia prezzi Jeep: 9 short boxes')
    } finally {
      await client.dispose()
    }
  })
})

describe('xmlReport', () => {
  const FEED = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Incentivi</title>
<entry><title>Pandina</title><link href="/p/1"/><media:thumbnail url="/1.jpg"/></entry>
<entry><title>600e</title><link href="/p/2"/></entry></feed>`

  it('hints at the default-namespace query and names the repeated elements', () => {
    const findings = describeXml(parseXml(FEED, 'feed.xml'))
    const report = xmlReport('https://x/feed.xml', findings)
    expect(report).toContain('query with "namespaces": { "x": "http://www.w3.org/2005/Atom" } and //x:feed')
    expect(report).toContain('//feed/entry  2 entries')
  })

  it('names a recognised sitemap on its first line', () => {
    const findings = describeXml(parseXml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://x/1</loc></url><url><loc>https://x/2</loc></url></urlset>', 'sitemap.xml'))
    expect(xmlReport('https://x/sitemap.xml', findings)).toContain('(XML: urlset, a sitemap of 2 pages)')
  })
})
