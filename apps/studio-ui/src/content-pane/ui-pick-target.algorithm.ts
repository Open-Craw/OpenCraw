/** What a controller names to pick on the web page: a CSS selector, or the text the element shows. */
export interface UiPickTarget {
  selector?: string
  text?:     string
}

/** The element found (its `data-oc-node` id and the text it shows), or why none was. */
export type FoundPickNode = { nodeId: string, text: string } | { reason: string }

/** A node's text as a person reads it: whitespace collapsed. */
function textOf (element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim() // eslint-disable-line unicorn/prefer-string-replace-all -- this app's `lib` has no `replaceAll`
}

function foundOf (element: Element | null): FoundPickNode {
  const node = element?.closest('[data-oc-node]')
  const nodeId = node instanceof HTMLElement ? node.dataset.ocNode : undefined
  if (node === null || node === undefined || nodeId === undefined) return { reason: 'that element is not part of the page snapshot' }

  return { nodeId, text: textOf(node).slice(0, 160) }
}

/** The element whose own text is the smallest one that equals `text` (case-insensitive), else the smallest one that contains it. */
function elementShowing (document: Document, text: string): Element | null {
  const wanted = text.replace(/\s+/g, ' ').trim().toLowerCase() // eslint-disable-line unicorn/prefer-string-replace-all -- this app's `lib` has no `replaceAll`
  let exact: { element: Element, length: number } | undefined
  let partial: { element: Element, length: number } | undefined
  for (const element of document.body.querySelectorAll('[data-oc-node]')) {
    const shown = textOf(element)
    const lowered = shown.toLowerCase()
    if (lowered === wanted && (exact === undefined || shown.length < exact.length)) exact = { element, length: shown.length }
    else if (lowered.includes(wanted) && (partial === undefined || shown.length < partial.length)) partial = { element, length: shown.length }
  }

  return exact?.element ?? partial?.element ?? null
}

/**
 * Finds the element of a web snapshot a controller asked to pick, the way a person would point at it: by CSS selector, or by the text it shows.
 *
 * @param html - The snapshot's HTML (every element carries a `data-oc-node` id).
 * @param target - The selector and/or text to look for; the selector wins when both are given.
 * @returns The element's node id and text, or why none was found.
 */
export function findPickNode (html: string, target: UiPickTarget): FoundPickNode {
  const document = new DOMParser().parseFromString(html, 'text/html')
  if (target.selector !== undefined) {
    try {
      const element = document.querySelector(target.selector)

      return element === null ? { reason: `nothing on the page matches ${target.selector}` } : foundOf(element)
    } catch {
      return { reason: `${target.selector} is not a valid CSS selector` }
    }
  }
  if (target.text === undefined) return { reason: 'say what to pick: a CSS selector or the text it shows' }
  const element = elementShowing(document, target.text)

  return element === null ? { reason: `no element on the page shows "${target.text}"` } : foundOf(element)
}
