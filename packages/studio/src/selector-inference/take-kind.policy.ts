import type { DomPathLevel } from './dom-path.model'

/** Attributes worth reading instead of text, in preference order, when the clicked element has one. */
const PREFERRED_ATTRS: Record<string, string[]> = {
  a:   ['href'],
  img: ['src', 'alt'],
}

/**
 * What a `Read` card's `take` should be for the element a pick landed on
 * (issue #91, studio plan §3.2): `attr:href` for an `<a>`, `attr:src` for an
 * `<img>`, `attr:<name>` for the first `data-*` attribute otherwise, `json`
 * for a `<script type="application/json">`, else the default, `text`.
 *
 * @param level - The clicked element's own level (the last entry of its `DomPath`).
 * @returns The `take` value to put on the `extract` step.
 */
export function takeKindFor (level: DomPathLevel): string {
  if (level.tag === 'script' && (level.attrs.type ?? '').toLowerCase() === 'application/json') return 'json'
  const preferred = PREFERRED_ATTRS[level.tag]
  if (preferred !== undefined) {
    const attribute = preferred.find(name => level.attrs[name] !== undefined)
    if (attribute !== undefined) return `attr:${attribute}`
  }
  const dataAttribute = Object.keys(level.attrs).find(name => name.startsWith('data-') && name !== 'data-oc-node' && name !== 'data-oc-hidden')
  if (dataAttribute !== undefined) return `attr:${dataAttribute}`

  return 'text'
}
