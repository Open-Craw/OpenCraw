import { load } from 'cheerio'
import { rewriteDocument } from './rewrite-document.mapper'

describe('rewriteDocument', () => {
  it('injects a <base> pointing at baseUrl, replacing any the page already had', () => {
    const { html } = rewriteDocument('<html><head><base href="/old"><title>x</title></head><body></body></html>', 'https://example.com/catalog/')
    const $ = load(html)
    expect($('base')).toHaveLength(1)
    expect($('base').attr('href')).toBe('https://example.com/catalog/')
  })

  it('makes href, src and action absolute against baseUrl', () => {
    const { html } = rewriteDocument('<a href="/p/1">x</a><img src="a.jpg"><form action="submit"></form>', 'https://example.com/catalog/')
    const $ = load(html)
    expect($('a').attr('href')).toBe('https://example.com/p/1')
    expect($('img').attr('src')).toBe('https://example.com/catalog/a.jpg')
    expect($('form').attr('action')).toBe('https://example.com/catalog/submit')
  })

  it('leaves javascript:, mailto: and data: URLs alone', () => {
    const { html } = rewriteDocument('<a href="javascript:void(0)">x</a><a href="mailto:a@b.com">y</a><img src="data:image/png;base64,AA">', 'https://example.com/')
    const $ = load(html)
    expect($('a').eq(0).attr('href')).toBe('javascript:void(0)')
    expect($('a').eq(1).attr('href')).toBe('mailto:a@b.com')
    expect($('img').attr('src')).toBe('data:image/png;base64,AA')
  })

  it('rewrites every url candidate in a srcset, keeping the descriptors', () => {
    const { html } = rewriteDocument('<img srcset="a.jpg 1x, /b.jpg 2x">', 'https://example.com/gallery/')
    const $ = load(html)
    expect($('img').attr('srcset')).toBe('https://example.com/gallery/a.jpg 1x, https://example.com/b.jpg 2x')
  })

  it('strips every <script>', () => {
    const { html } = rewriteDocument('<p>hi</p><script>alert(1)</script>', 'https://example.com/')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert')
  })

  it('strips <meta http-equiv="refresh">, which would navigate the sandboxed frame on its own', () => {
    const { html } = rewriteDocument('<head><meta http-equiv="refresh" content="0; url=/x"><meta charset="utf-8"></head>', 'https://example.com/')
    const $ = load(html)
    expect($('meta[http-equiv]')).toHaveLength(0)
    expect($('meta[charset]')).toHaveLength(1)
  })

  it('disables forms: strips onsubmit, makes fields read-only/disabled', () => {
    const { html } = rewriteDocument('<form onsubmit="doIt()"><input name="q"><textarea name="t"></textarea><select name="s"><option>a</option></select><button type="submit">Go</button></form>', 'https://example.com/')
    const $ = load(html)
    expect($('form').attr('onsubmit')).toBeUndefined()
    expect($('input').attr('readonly')).toBe('readonly')
    expect($('textarea').attr('readonly')).toBe('readonly')
    expect($('select').attr('disabled')).toBe('disabled')
    expect($('button').attr('disabled')).toBe('disabled')
  })

  it('stamps every element with a stable data-oc-node id, in document order, and reports the count', () => {
    const { html, nodeCount } = rewriteDocument('<div><p>a</p><p>b</p></div>', 'https://example.com/')
    const $ = load(html)
    const ids = $('*').map((_index, element) => $(element).attr('data-oc-node')).get()
    expect(ids).toEqual([...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))))
    expect(new Set(ids).size).toBe(ids.length) // every id unique
    expect(nodeCount).toBe(ids.length)
  })

  it('carries a data-oc-hidden mark straight through, unchanged (hidden-marks.algorithm.ts sets it before this ever runs)', () => {
    const { html } = rewriteDocument('<p data-oc-hidden="1">gone</p>', 'https://example.com/')
    const $ = load(html)
    expect($('p').attr('data-oc-hidden')).toBe('1')
  })
})
