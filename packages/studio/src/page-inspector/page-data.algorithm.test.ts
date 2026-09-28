import { pageData } from './page-data.algorithm'

describe('pageData', () => {
  it('finds a JSON-LD block, labelled by its @type, with a selector reaching only it and its top-level keys', () => {
    const html = '<!doctype html><html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Pandina","price":15950}</script></head><body></body></html>'
    const findings = pageData(html)
    const ldJson = findings.find(f => f.kind === 'ld-json')
    expect(ldJson).toMatchObject({ label: 'ld+json: Product', selectorKind: 'css', matches: 1 })
    expect(ldJson?.keys).toEqual(expect.arrayContaining(['name', 'price']))
    expect(ldJson?.selector).toBe('html > head > script')
  })

  it('finds an application/json script block, distinct from ld+json', () => {
    const html = '<html><head><script type="application/json" id="data">{"a":1}</script></head><body></body></html>'
    const findings = pageData(html)
    expect(findings.find(f => f.kind === 'json-script')).toMatchObject({ selectorKind: 'css', matches: 1, keys: ['a'] })
  })

  it('finds an inline state assignment by its global name, and the parsed value\'s keys', () => {
    const html = '<html><body><script>window.__NEXT_DATA__ = {"props":{"price":42}}</script></body></html>'
    const findings = pageData(html)
    const state = findings.find(f => f.kind === 'inline-state')
    expect(state).toMatchObject({ label: '__NEXT_DATA__', matches: 1 })
    expect(state?.keys).toEqual(['props'])
  })

  it('ignores an inline script with no recognised global-state assignment', () => {
    const html = '<html><body><script>console.log("hi")</script></body></html>'
    expect(pageData(html).some(f => f.kind === 'inline-state')).toBe(false)
  })

  it('finds meta name/property values and link rels, each with a verified selector and its attribute', () => {
    const html = '<html><head><meta name="description" content="hi"><meta property="og:title" content="Hi"><link rel="canonical" href="/x"></head><body></body></html>'
    const findings = pageData(html)
    expect(findings.find(f => f.kind === 'meta' && f.label === 'meta: description')).toMatchObject({ attribute: 'content', matches: 1 })
    expect(findings.find(f => f.kind === 'meta' && f.label === 'meta: og:title')).toMatchObject({ attribute: 'content', matches: 1 })
    expect(findings.find(f => f.kind === 'link')).toMatchObject({ label: 'link: canonical', attribute: 'href', matches: 1 })
  })

  it('gives each of several ld+json blocks its own selector, disambiguated by position', () => {
    const html = '<html><head>' +
      '<script type="application/ld+json">{"@type":"Product","name":"a"}</script>' +
      '<script type="application/ld+json">{"@type":"Organization","name":"b"}</script>' +
      '</head><body></body></html>'
    const findings = pageData(html).filter(f => f.kind === 'ld-json')
    expect(findings).toHaveLength(2)
    expect(new Set(findings.map(f => f.selector)).size).toBe(2)
    expect(findings.every(f => f.matches === 1)).toBe(true)
  })
})
