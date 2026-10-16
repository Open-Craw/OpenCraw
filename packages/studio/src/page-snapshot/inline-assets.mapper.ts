import { load } from 'cheerio'

/** A stylesheet or font the page loaded, as the capture browser received it. */
export interface CapturedAsset {
  kind: 'css' | 'font'
  /** The bytes; text for a stylesheet. */
  body: Uint8Array
}

const FONT_TYPES: Record<string, string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', svg: 'image/svg+xml' }
/** `url(...)` in a stylesheet, quoted or not. */
const CSS_URL = /url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g

/** The address a `url()` in a stylesheet at `base` points to, or `undefined` for one that is not an address (inline data, a fragment). */
function resolved (reference: string, base: string): string | undefined {
  if (reference.startsWith('data:') || reference.startsWith('#')) return undefined
  try {
    return new URL(reference, base).href
  } catch {
    return undefined
  }
}

function fontType (address: string): string {
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(new URL(address).pathname + new URL(address).search)?.[1]?.toLowerCase()

  return (extension === undefined ? undefined : FONT_TYPES[extension]) ?? 'application/octet-stream'
}

/**
 * A stylesheet's text with every `url(...)` made absolute, and each font the page loaded embedded as a data address. The picture of a page
 * is shown in a frame that is not the site, so a font file is a cross-site request the site's server does not allow: its text comes
 * out in a fallback face and its icons (a menu, a close button) as empty boxes. A font inside the page cannot be refused.
 *
 * @param css - The stylesheet text.
 * @param base - Where the stylesheet came from (or the page, for a `<style>` in it).
 * @param assets - What the page loaded, by address.
 * @returns The stylesheet, ready to sit inside the snapshot.
 */
export function embedFonts (css: string, base: string, assets: ReadonlyMap<string, CapturedAsset>): string {
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- one replacer with a global pattern
  return css.replace(CSS_URL, (whole: string, _quote: string, reference: string) => {
    const address = resolved(reference.trim(), base)
    if (address === undefined) return whole
    const asset = assets.get(address)
    if (asset?.kind !== 'font') return `url("${address}")`

    return `url("data:${fontType(address)};base64,${Buffer.from(asset.body).toString('base64')}")`
  })
}

/**
 * Turns a captured page into one that carries its own styles: every `<link rel="stylesheet">` the page loaded becomes a `<style>` with
 * the stylesheet's text, and the fonts in it (and in the page's own `<style>`s) are embedded. A stylesheet that was not captured is left
 * as the link it was.
 *
 * @param html - The page as captured.
 * @param pageUrl - The page's address.
 * @param assets - The stylesheets and fonts the page loaded, by address.
 * @returns The page with its styles and fonts inside it.
 */
export function inlineAssets (html: string, pageUrl: string, assets: ReadonlyMap<string, CapturedAsset>): string {
  const $ = load(html)
  $('link[rel~="stylesheet"][href]').each((_index, element) => {
    const reference = $(element).attr('href') ?? ''
    const address = resolved(reference, pageUrl)
    const asset = address === undefined ? undefined : assets.get(address)
    if (address === undefined || asset?.kind !== 'css') return
    const css = embedFonts(Buffer.from(asset.body).toString('utf8'), address, assets)
    const inlined = $('<style></style>').attr('data-oc-from', address)
    inlined.text(css)
    $(element).replaceWith(inlined)
  })
  $('style').each((_index, element) => {
    if ($(element).attr('data-oc-from') !== undefined) return
    const css = $(element).text()
    if (css.includes('url(')) $(element).text(embedFonts(css, pageUrl, assets))
  })

  return $.html()
}
