import { hasVisibleContent } from './visible-content.algorithm'

describe('hasVisibleContent', () => {
  it('is false for a script-driven shell', () => {
    expect(hasVisibleContent('<html><head><style>.a{}</style></head><body><div id="app"></div><script>boot()</script><noscript>Enable JS</noscript></body></html>')).toBe(false)
  })

  it('is true for a page with a few sentences of text', () => {
    expect(hasVisibleContent(`<body><p>${'The BYD Seal is a rear-wheel drive electric saloon. '.repeat(3)}</p></body>`)).toBe(true)
  })

  it('is false for a shell holding only a short footnote', () => {
    expect(hasVisibleContent('<body><div id="app"></div><p>*Images shown for illustrative purposes only. Actual UK Spec may vary.</p></body>')).toBe(false)
  })

  it('is true for a page that only shows an image or a form control', () => {
    expect(hasVisibleContent('<body><img src="a.png"></body>')).toBe(true)
    expect(hasVisibleContent('<body><input></body>')).toBe(true)
  })

  it('is true for a small page of headings and links, as a shop catalog (issue #145)', () => {
    expect(hasVisibleContent('<body><h1>Catalog, page 1</h1><ul><li><a href="/product/11">Trail runner</a></li></ul></body>')).toBe(true)
  })

  it('ignores text that only sits in scripts and styles', () => {
    expect(hasVisibleContent('<body><script>var x = "hello"</script><style>p { }</style></body>')).toBe(false)
  })
})
