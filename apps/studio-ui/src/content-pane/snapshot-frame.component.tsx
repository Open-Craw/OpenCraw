import { useEffect, useRef } from 'react'
import { pickerStyleCss } from './picker-style.mapper'

export interface SnapshotFrameProps {
  /** The rewritten snapshot document (`take-snapshot`): absolute urls, a base, every element carrying `data-oc-node`. */
  html:             string
  /** Whether the content pane is in pick mode: a click on a stamped element calls `onPickNode` instead of doing nothing. */
  pickMode:         boolean
  /** The hidden-elements toggle. */
  showHidden:       boolean
  /** A Steps card's selector, to highlight its matches (two-way highlight). */
  hoveredSelector?: string
  /** Called with the hovered element's `data-oc-node` id, or `undefined` once the pointer leaves it. */
  onHoverNode:      (nodeId: string | undefined) => void
  /** Called with a clicked element's `data-oc-node` id, only while `pickMode` is true. */
  onPickNode:       (nodeId: string) => void
}

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
  const propsRef = useRef({ pickMode, onHoverNode, onPickNode })
  propsRef.current = { pickMode, onHoverNode, onPickNode }

  useEffect(() => {
    const iframe = iframeRef.current
    if (iframe === null) return

    let cleanupDoc: (() => void) | undefined

    const handleMouseOver = (event: MouseEvent): void => { propsRef.current.onHoverNode(nodeIdOf(event.target)) }
    const handleMouseOut = (): void => { propsRef.current.onHoverNode(undefined) }
    const handleClick = (event: MouseEvent): void => {
      if (!propsRef.current.pickMode) return
      const nodeId = nodeIdOf(event.target)
      if (nodeId === undefined) return
      event.preventDefault()
      event.stopPropagation()
      propsRef.current.onPickNode(nodeId)
    }

    const handleLoad = (): void => {
      const doc = iframe.contentDocument
      if (doc === null) return
      doc.addEventListener('mouseover', handleMouseOver)
      doc.addEventListener('mouseout', handleMouseOut)
      doc.addEventListener('click', handleClick, { capture: true })
      cleanupDoc = () => {
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

  return (
    <iframe
      ref={iframeRef}
      title='Snapshot'
      sandbox='allow-same-origin'
      srcDoc={html}
      style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
    />
  )
}

/** The `data-oc-node` id of the stamped element at or above `target`. The target belongs to the iframe's own realm, so `target instanceof Element` is false for it: test the node type instead (issue #153). */
function nodeIdOf (target: EventTarget | null): string | undefined {
  const element = (target as Node | null)?.nodeType === Node.ELEMENT_NODE ? (target as Element).closest(`[${CSS.escape(NODE_ID_ATTRIBUTE)}]`) : null

  return element?.getAttribute(NODE_ID_ATTRIBUTE) ?? undefined
}
