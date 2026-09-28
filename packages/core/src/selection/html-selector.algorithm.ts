import { load } from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode } from 'domhandler'

/** A matched HTML element together with the document it belongs to. */
export interface HtmlMatch {
  api:     CheerioAPI
  element: Cheerio<AnyNode>
}

const DOCUMENT = /^\s*(?:<!doctype|<html)/i

/**
 * Runs a CSS selector on static HTML. A whole document is parsed as one; anything
 * else (a table row, a list item taken with `take: "html"`) is parsed as a
 * fragment, so cells and rows outside a table survive instead of being dropped.
 *
 * @param html - The markup (a whole document or a fragment).
 * @param selector - A CSS selector.
 * @param xml - Read the markup as XML: names keep their case, `take: "html"` gives XML.
 * @returns Every match, in document order.
 */
export function selectHtml (html: string, selector: string, xml = false): HtmlMatch[] {
  const api = xml ? load(html, { xml: true }) : (DOCUMENT.test(html) ? load(html) : load(html, undefined, false))

  return api(selector).map((_, element) => ({ api, element: api(element) })).toArray()
}

/**
 * The attribute the studio's `page-snapshot` slice stamps on every element of
 * a captured document (`rewrite-document.mapper.ts`, `@opencraw/studio`), so
 * a selector's matches can be pointed back at specific DOM nodes. Named here,
 * not in the studio package, so `matchesOf` needs no knowledge that lives
 * outside this leaf slice.
 */
export const NODE_ID_ATTRIBUTE = 'data-oc-node'

/**
 * How many elements a selector matches. Used by the studio to show a
 * candidate's match count as it verifies it against the snapshot and the
 * live page (studio plan §3.2, issue #91); a thin, additive wrapper over
 * `selectHtml` so the studio never reimplements CSS matching.
 *
 * Only `kind: "css"` is handled here: `selection` is a leaf slice and cannot
 * depend on `xml-document` (whose `selectXpath` depends on `selection`
 * itself, so the reverse import would cycle). XPath verification composes
 * `@opencraw/core`'s already-exported `htmlAsXml` + `selectXpath` one layer
 * up, in the studio's `selector-inference`/`page-snapshot` slices — see
 * `packages/studio/src/page-snapshot/take-snapshot.use-case.ts`'s sibling
 * `verify-selector` wiring for where that happens.
 *
 * @param html - The markup (a whole document or a fragment).
 * @param selector - A CSS selector.
 * @param kind - Only `"css"` is supported; anything else throws.
 * @returns The number of matches.
 */
export function countMatches (html: string, selector: string, kind: 'css' = 'css'): number {
  if (kind !== 'css') throw new Error(`countMatches: unsupported kind "${kind}" (xpath is verified one layer up; see this function's doc comment)`)

  return selectHtml(html, selector).length
}

/**
 * The node id (`data-oc-node`) of every element a selector matches, in
 * document order; a match with no such attribute (markup the studio did not
 * stamp) falls back to its position, `#<index>`, so the list still lines up
 * with `selectHtml`'s own order. See `countMatches` for why only css is
 * handled here.
 *
 * @param html - The markup (a whole document or a fragment).
 * @param selector - A CSS selector.
 * @param kind - Only `"css"` is supported; anything else throws.
 * @returns One node id per match.
 */
export function matchesOf (html: string, selector: string, kind: 'css' = 'css'): string[] {
  if (kind !== 'css') throw new Error(`matchesOf: unsupported kind "${kind}" (xpath is verified one layer up; see countMatches' doc comment)`)

  return selectHtml(html, selector).map((match, index) => match.element.attr(NODE_ID_ATTRIBUTE) ?? `#${index}`)
}
