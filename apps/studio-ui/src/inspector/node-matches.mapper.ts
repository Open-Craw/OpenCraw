/** The attribute `page-snapshot`'s `rewrite-document.mapper.ts` stamps on every element — kept as a plain constant here (mirrors `content-pane/snapshot-frame.component.tsx`'s own copy): `apps/studio-ui` does not import `@opencraw/studio`'s runtime code, only types. */
const NODE_ID_ATTRIBUTE = 'data-oc-node'

/**
 * Which of a DOM tree's node ids a css selector matches, computed against
 * the browser's own parse of the snapshot html — the two-way highlight
 * between a Steps card's pill and the Inspect panel's tree (studio plan
 * §3.3/§4.1, issue #93) needs to know which tree rows a hovered/selected
 * card's selector reaches, and the tree is plain React state, not real DOM a
 * CSS rule could match the way `snapshot-frame.component.tsx`'s own
 * highlight does. Never used to build or verify a recipe's own selector
 * (`selector-inference`/`infer-selector` own that, server-side, against the
 * engine's real `css` selection); this is a display-only approximation.
 *
 * @param snapshotHtml - The cached, rewritten snapshot's html.
 * @param selector - A css selector (a step's own `selector`, when its `kind` is `"css"`).
 * @returns The matching node ids; empty for a blank or invalid selector, rather than throwing.
 */
export function matchingNodeIds (snapshotHtml: string, selector: string): Set<string> {
  if (selector.trim() === '') return new Set()
  try {
    const doc = new DOMParser().parseFromString(snapshotHtml, 'text/html')
    const matches = doc.querySelectorAll(selector)

    return new Set(Array.from(matches, element => element.getAttribute(NODE_ID_ATTRIBUTE)).filter((id): id is string => id !== null))
  } catch {
    return new Set()
  }
}
