import { load } from 'cheerio'
import { NODE_ID_ATTRIBUTE } from '@opencraw/core'

/** Attributes that carry a URL and are rewritten to absolute; `srcset` is handled separately (it carries several). */
const URL_ATTRIBUTES = ['href', 'src', 'action', 'poster']
/** Schemes left untouched: they are not a location `new URL(value, base)` should resolve, or already carry their own meaning. */
const SKIP_SCHEME = /^(?:javascript|mailto|tel|data|about):/i

export interface RewrittenDocument {
  /** The document, ready for the sandboxed iframe: absolute URLs, a `<base>`, no `<script>`, forms disabled, `<meta http-equiv="refresh">` stripped, every element carrying a `data-oc-node` id. */
  html:      string
  /** How many elements were stamped with a node id — the same count `page-inspector` (phase 4) and the picker's match counts can be checked against. */
  nodeCount: number
}

/**
 * Rewrites captured HTML into what the content pane's sandboxed iframe shows
 * (studio plan §3.1, issue #91): every URL made absolute against `baseUrl`,
 * a `<base>` injected, every `<script>` removed, forms disabled (`onsubmit`
 * stripped, fields made read-only), `<meta http-equiv="refresh">` stripped
 * (it would otherwise navigate the sandboxed frame on its own), and every
 * element given a stable `data-oc-node` id, in document order, for the
 * picker overlay and `selector-inference` to address specific nodes by.
 *
 * Purely a markup transform: it does not know whether an element is hidden
 * on the live page (`display: none`, `visibility: hidden`, zero size) — in
 * web mode that is `hidden-marks.algorithm.ts`'s job, run against the live
 * page *before* this function ever sees the markup, so a `data-oc-hidden`
 * attribute it wrote just survives serialisation untouched here.
 *
 * @param html - The captured document (`page.content()` in web mode, the fetched body in api mode).
 * @param baseUrl - The page's own URL, for resolving relative links and as the `<base>`.
 * @returns The rewritten document and how many elements it stamped.
 */
export function rewriteDocument (html: string, baseUrl: string): RewrittenDocument {
  const $ = load(html)
  if ($('head').length === 0) $('html').prepend('<head></head>')
  const head = $('head').first()
  head.find('base').remove()
  head.prepend(`<base href="${escapeAttribute(baseUrl)}">`)

  $('meta').each((_index, element) => {
    if (($(element).attr('http-equiv') ?? '').toLowerCase() === 'refresh') $(element).remove()
  })
  $('script').remove()

  $('form').removeAttr('onsubmit')
  $('input, textarea').attr('readonly', 'readonly')
  $('select, button, input[type="submit"], input[type="button"]').attr('disabled', 'disabled')

  $('*').each((_index, element) => {
    const node = $(element)
    for (const attribute of URL_ATTRIBUTES) {
      const value = node.attr(attribute)
      if (value !== undefined) node.attr(attribute, resolveUrl(value, baseUrl) ?? value)
    }
    const srcset = node.attr('srcset')
    if (srcset !== undefined) node.attr('srcset', rewriteSrcset(srcset, baseUrl))
  })

  let nodeCount = 0
  $('*').each((_index, element) => {
    $(element).attr(NODE_ID_ATTRIBUTE, `n${nodeCount}`)
    nodeCount += 1
  })

  return { html: $.html(), nodeCount }
}

/** Resolves one URL against `baseUrl`; a scheme that is not a location (`javascript:`, `data:`…), or a value `new URL` cannot parse, is left as it was. */
function resolveUrl (value: string, baseUrl: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '' || SKIP_SCHEME.test(trimmed)) return undefined
  try {
    return new URL(trimmed, baseUrl).href
  } catch {
    return undefined
  }
}

/** `srcset`'s own micro-syntax: comma-separated `url descriptor?` pairs. Malformed entries are passed through unresolved rather than dropped. */
function rewriteSrcset (value: string, baseUrl: string): string {
  return value.split(',').map((candidate) => {
    const trimmed = candidate.trim()
    const spaceAt = trimmed.indexOf(' ')
    const url = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt)
    const descriptor = spaceAt === -1 ? '' : trimmed.slice(spaceAt)

    return `${resolveUrl(url, baseUrl) ?? url}${descriptor}`
  }).join(', ')
}

function escapeAttribute (value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}
