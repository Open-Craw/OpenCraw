import { useEffect, useRef, useState } from 'react'
import { pickerStyleCss } from './picker-style.mapper'

export interface SnapshotFrameProps {
  /** The rewritten snapshot document (`take-snapshot`): absolute urls, a base, every element carrying `data-oc-node`. */
  html:             string
  /** Whether a pick is under way (the cursor becomes a crosshair); a click on a stamped element calls `onPickNode` either way. */
  pickMode:         boolean
  /** The hidden-elements toggle. */
  showHidden:       boolean
  /** A Steps card's selector, to highlight its matches (two-way highlight). */
  hoveredSelector?: string
  /** Called with the hovered element's `data-oc-node` id, or `undefined` once the pointer leaves it. */
  onHoverNode:      (nodeId: string | undefined) => void
  /** Called with a clicked element's `data-oc-node` id. */
  onPickNode:       (nodeId: string) => void
}

/** A web page is laid out at least this wide (a normal desktop window) and shrunk to fit a narrower pane, rather than cut off at the pane's edge. */
const MIN_PAGE_WIDTH = 1000
const NODE_ID_ATTRIBUTE = 'data-oc-node'
const STYLE_ELEMENT_ID = 'opencraw-picker-style'

/**
 * The content pane's snapshot iframe and its picker overlay (studio plan
 * §3.1/§3.2, issue #91): a sandboxed iframe (`allow-same-origin`, no
 * `allow-scripts`) showing the rewritten document, with hover-to-outline and
 * click-to-pick wired from here — the parent's own script, reaching into the
 * iframe's DOM directly (`allow-same-origin` permits that), rather than a
 * script injected *into* the sandboxed document, which would not run at all
 * without `allow-scripts`.
 *
 * Event handlers are kept in a ref, not the `load` listener's closure, so
 * `pickMode`/`onPickNode`/`onHoverNode` changing does not need the iframe to
 * reload (`load` only fires once per `html`) to take effect.
 */
export function SnapshotFrame ({ html, pickMode, showHidden, hoveredSelector, onHoverNode, onPickNode }: SnapshotFrameProps): React.ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [pane, setPane] = useState({ width: 0, height: 0 })
  const propsRef = useRef({ onHoverNode, onPickNode })
  propsRef.current = { onHoverNode, onPickNode }

  useEffect(() => {
    const iframe = iframeRef.current
    if (iframe === null) return

    let cleanupDoc: (() => void) | undefined

    const handleMouseOver = (event: MouseEvent): void => { propsRef.current.onHoverNode(nodeIdOf(event.target)) }
    const handleMouseOut = (): void => { propsRef.current.onHoverNode(undefined) }
    const handleClick = (event: MouseEvent): void => {
      // The snapshot is a picture of the page, not the page: a link must never navigate this frame to the live
      // site (which usually refuses to be framed), whether or not a pick is under way.
      if (linkOf(event.target) !== undefined) event.preventDefault()
      // A click is a pick whether or not "Read" was pressed first: hovering outlines the element, so a click on it must do something.
      const nodeId = nodeIdOf(event.target)
      if (nodeId === undefined) return
      event.preventDefault()
      event.stopPropagation()
      propsRef.current.onPickNode(nodeId)
    }

    const blockContextMenu = (event: MouseEvent): void => { event.preventDefault() }

    const handleLoad = (): void => {
      const doc = iframe.contentDocument
      if (doc === null) return
      doc.addEventListener('mouseover', handleMouseOver)
      doc.addEventListener('mouseout', handleMouseOut)
      doc.addEventListener('click', handleClick, { capture: true })
      doc.addEventListener('contextmenu', blockContextMenu)
      cleanupDoc = () => {
        doc.removeEventListener('contextmenu', blockContextMenu)
        doc.removeEventListener('mouseover', handleMouseOver)
        doc.removeEventListener('mouseout', handleMouseOut)
        doc.removeEventListener('click', handleClick, { capture: true })
      }
    }
    iframe.addEventListener('load', handleLoad)

    return () => {
      iframe.removeEventListener('load', handleLoad)
      cleanupDoc?.()
    }
  }, [html])

  useEffect(() => {
    const box = boxRef.current
    if (box === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { setPane({ width: box.clientWidth, height: box.clientHeight }) })
    observer.observe(box)

    return () => { observer.disconnect() }
  }, [])

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (doc === null || doc === undefined) return
    let style = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null
    if (style === null) {
      style = doc.createElement('style')
      style.id = STYLE_ELEMENT_ID
      doc.head?.append(style)
    }
    style.textContent = pickerStyleCss(pickMode, showHidden, hoveredSelector)
  })

  // Laid out as a desktop page and shrunk to the pane's width: nothing is cut off at the right edge.
  const measured = pane.width > 0
  const pageWidth = measured ? Math.max(pane.width, MIN_PAGE_WIDTH) : 0
  const scale = measured ? pane.width / pageWidth : 1
  const frameStyle = measured && scale < 1
    ? { width: `${String(pageWidth)}px`, height: `${String(pane.height / scale)}px`, transform: `scale(${String(scale)})`, transformOrigin: 'top left' }
    : { width: '100%', height: '100%' }

  return (
    <div ref={boxRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <iframe
        ref={iframeRef}
        title='Snapshot'
        sandbox='allow-same-origin'
        srcDoc={html}
        style={{ ...frameStyle, border: 'none', background: 'white' }}
      />
    </div>
  )
}

/** The link at or above `target`, if any (same cross-realm caveat as `nodeIdOf`). */
function linkOf (target: EventTarget | null): Element | undefined {
  const element = (target as Node | null)?.nodeType === Node.ELEMENT_NODE ? (target as Element).closest('a[href], area[href]') : null

  return element ?? undefined
}

/** The `data-oc-node` id of the stamped element at or above `target`. The target belongs to the iframe's own realm, so `target instanceof Element` is false for it: test the node type instead (issue #153). */
function nodeIdOf (target: EventTarget | null): string | undefined {
  const element = (target as Node | null)?.nodeType === Node.ELEMENT_NODE ? (target as Element).closest(`[${CSS.escape(NODE_ID_ATTRIBUTE)}]`) : null

  return element?.getAttribute(NODE_ID_ATTRIBUTE) ?? undefined
}
