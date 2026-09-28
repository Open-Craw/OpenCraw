import { load } from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import { countMatches, tryParseJson } from '@opencraw/core'
import { describeJson } from '@opencraw/probe'

/** The global names sites hydrate state into, that `describeHtml`'s own JSON-LD/table scan does not cover (issue #93's "inline state assignments"). */
const INLINE_STATE_NAMES = ['__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__APOLLO_STATE__', '__PRELOADED_STATE__', '__STATE__']
const INLINE_STATE_PATTERN = new RegExp(String.raw`(?:window\.)?(${INLINE_STATE_NAMES.join('|')})\s*=`)

export type PageDataKind = 'ld-json' | 'json-script' | 'inline-state' | 'meta' | 'link'

/** One pickable value in "data in the page" (studio plan §3.3, issue #93): a `<script type="application/ld+json">`/`"application/json">` block, an inline state assignment, a `<meta>`, or a `<link rel>`. */
export interface PageDataFinding {
  kind:         PageDataKind
  /** What the UI shows for this row: the JSON-LD `@type`, the global name assigned (`__NEXT_DATA__`), or `meta:`/`link:` and its name/rel. */
  label:        string
  /** A selector verified against the real page (never the sanitised snapshot: `ld-json`/`json-script`/`inline-state` live inside a `<script>`, which the snapshot's `rewriteDocument` strips for the sandboxed iframe — see this file's own doc comment). */
  selector:     string
  selectorKind: 'css'
  /** How many elements this selector reaches on the real page — always 1 by construction (`structuralSelector` is a full ancestor path), kept as a field so the UI's "N matches" confidence reads the same as a tree pick's. */
  matches:      number
  /** The parsed value's top-level keys, each pickable as its own `$.<key>` `jsonpath` card — absent when the value is not a JSON object (an array, a scalar, or text that did not parse). */
  keys?:        string[]
  /** `meta`/`link` only: which attribute holds the pickable value (`content`/`href`). */
  attribute?:   string
}

/**
 * Finds the data-in-the-page findings the Inspect panel lists apart from the
 * DOM tree (studio plan §3.3, issue #93): JSON-LD and `application/json`
 * script blocks, inline state assignments, `<meta>` name/property values and
 * `<link rel>`s — reusing `@opencraw/probe`'s `describeJson` for a found
 * value's shape (its own `find-data.algorithm.ts`/`html-findings.mapper.ts`
 * scan a page's raw text for *reporting*, with no element to point a pick at;
 * this function's own job — locating each finding's element so a pick can
 * reach it — is new).
 *
 * Takes the **raw** captured document, not the display snapshot
 * (`page-snapshot`'s `SnapshotResult.html`): `rewriteDocument` strips every
 * `<script>` for the sandboxed iframe, which would make JSON-LD, inline
 * state and other script-tag data invisible here. `<meta>`/`<link>` survive
 * rewriting untouched, so using the raw document for every kind (rather than
 * mixing two documents) keeps this function simple and its selectors
 * verified against what the engine will actually crawl.
 *
 * @param rawHtml - The document as fetched/rendered, before `rewriteDocument` strips scripts.
 * @returns The findings, in document order.
 */
export function pageData (rawHtml: string): PageDataFinding[] {
  const $ = load(rawHtml)
  const findings: PageDataFinding[] = []

  $('script[type="application/ld+json"]').each((_index, element) => {
    findings.push(...scriptFinding($, element, rawHtml, 'ld-json', ldJsonLabel))
  })
  $('script[type="application/json"]').each((_index, element) => {
    findings.push(...scriptFinding($, element, rawHtml, 'json-script', () => `json: ${structuralSelector($, element)}`))
  })
  $('script').each((_index, element) => {
    const type = $(element).attr('type')
    if (type !== undefined && type !== 'text/javascript' && type !== 'module') return
    const text = $(element).text()
    const match = INLINE_STATE_PATTERN.exec(text)
    if (match === null) return
    const value = tryParseJson(text)
    const selector = structuralSelector($, element)
    findings.push({ kind: 'inline-state', label: match[1], selector, selectorKind: 'css', matches: countMatches(rawHtml, selector), keys: keysOf(value) })
  })
  $('meta[name], meta[property]').each((_index, element) => {
    const name = $(element).attr('name') ?? $(element).attr('property') ?? ''
    const selector = structuralSelector($, element)
    findings.push({ kind: 'meta', label: `meta: ${name}`, selector, selectorKind: 'css', matches: countMatches(rawHtml, selector), attribute: 'content' })
  })
  $('link[rel]').each((_index, element) => {
    const rel = $(element).attr('rel') ?? ''
    const selector = structuralSelector($, element)
    findings.push({ kind: 'link', label: `link: ${rel}`, selector, selectorKind: 'css', matches: countMatches(rawHtml, selector), attribute: 'href' })
  })

  return findings
}

function scriptFinding ($: CheerioAPI, element: Element, rawHtml: string, kind: 'ld-json' | 'json-script', labelOf: (value: unknown) => string): PageDataFinding[] {
  const value = tryParseJson($(element).text())
  if (value === undefined) return []
  const selector = structuralSelector($, element)

  return [{ kind, label: labelOf(value), selector, selectorKind: 'css', matches: countMatches(rawHtml, selector), keys: keysOf(value) }]
}

function ldJsonLabel (value: unknown): string {
  if (Array.isArray(value)) return `ld+json: array (${value.length})`
  if (typeof value === 'object' && value !== null) {
    const type = (value as Record<string, unknown>)['@type']
    if (typeof type === 'string') return `ld+json: ${type}`
  }

  return `ld+json: ${describeJson(value, 'json').type}`
}

function keysOf (value: unknown): string[] | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : undefined
}

/**
 * A unique CSS path for an element with no stable attribute of its own
 * (a `<script>` tag has no id or class to speak of): `<ancestor> > tag`
 * from `<html>` down, `:nth-of-type` added only where a tag has siblings of
 * the same name under the same parent. Always resolves to exactly one
 * element, on the raw document this ran against and on the real page (a
 * purely structural selector, unaffected by the snapshot's own rewriting).
 *
 * @param $ - The document.
 * @param element - The element to address.
 * @returns The selector.
 */
function structuralSelector ($: CheerioAPI, element: Element): string {
  const segments: string[] = []
  let $current = $(element)
  while ($current.length > 0) {
    const tag = $current.prop('tagName')?.toLowerCase()
    if (tag === undefined) break
    const $parent = $current.parent()
    const siblingsOfType = $parent.length > 0 ? $parent.children(tag) : $current
    const index = siblingsOfType.toArray().indexOf($current.get(0) as Element) + 1
    segments.unshift(siblingsOfType.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
    if (tag === 'html' || $parent.length === 0) break
    $current = $parent
  }

  return segments.join(' > ')
}
