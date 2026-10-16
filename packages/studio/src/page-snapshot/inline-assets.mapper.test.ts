import { embedFonts, inlineAssets } from './inline-assets.mapper'
import type { CapturedAsset } from './inline-assets.mapper'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)
const FONT: CapturedAsset = { kind: 'font', body: bytes('FONTDATA') }
const ASSETS = new Map<string, CapturedAsset>([
  ['https://site.test/client/icons.woff2', FONT],
  ['https://site.test/css/main.css', { kind: 'css', body: bytes('@font-face{font-family:Icons;src:url(../client/icons.woff2) format("woff2")} .logo{background:url(img/logo.png)}') }],
])

describe('embedFonts', () => {
  it('embeds a font the page loaded, and makes any other address absolute', () => {
    const css = embedFonts('@font-face{src:url("/client/icons.woff2?v=1")} .a{background:url(pic.png)}', 'https://site.test/css/main.css', new Map([['https://site.test/client/icons.woff2?v=1', FONT]]))

    expect(css).toContain(`url("data:font/woff2;base64,${Buffer.from('FONTDATA').toString('base64')}")`)
    expect(css).toContain('url("https://site.test/css/pic.png")')
  })

  it('leaves inline data and fragments alone', () => {
    expect(embedFonts('.a{background:url(data:image/png;base64,AAA)} .b{filter:url(#blur)}', 'https://site.test/', new Map())).toBe('.a{background:url(data:image/png;base64,AAA)} .b{filter:url(#blur)}')
  })
})

describe('inlineAssets', () => {
  it('replaces a captured stylesheet link with its text, fonts embedded, and keeps one it did not capture', () => {
    const html = '<html><head><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="https://other.test/x.css"></head><body>x</body></html>'

    const out = inlineAssets(html, 'https://site.test/page', ASSETS)

    expect(out).toContain('<style data-oc-from="https://site.test/css/main.css">')
    expect(out).toContain(Buffer.from('FONTDATA').toString('base64'))
    expect(out).not.toContain('href="/css/main.css"')
    expect(out).toContain('href="https://other.test/x.css"')
  })

  it('embeds the fonts a page\'s own style block uses', () => {
    const out = inlineAssets('<html><head><style>@font-face{src:url(/client/icons.woff2)}</style></head><body></body></html>', 'https://site.test/page', ASSETS)

    expect(out).toContain('data:font/woff2;base64,')
  })
})
