/**
 * The CSS injected into the snapshot iframe's own document for the picker
 * overlay (studio plan §3.2, issue #91): a hover outline on every node the
 * snapshot stamped, the pointer shaped for pick mode, the hovered card's
 * matches highlighted (two-way highlight, studio plan §4.1), and hidden
 * elements shown greyed when the toggle is on. Kept as a pure string
 * builder, separate from the DOM wiring in `snapshot-frame.tsx`, so the
 * rule set itself is unit-testable without a real iframe.
 *
 * @param pickMode - Whether the content pane is in pick mode (crosshair cursor, hover-to-outline).
 * @param showHidden - The hidden-elements toggle: grey and outline `data-oc-hidden` nodes instead of leaving them as the live page rendered them.
 * @param hoveredSelector - A Steps card's selector being hovered, so its matches light up in the iframe.
 * @returns The stylesheet text.
 */
export function pickerStyleCss (pickMode: boolean, showHidden: boolean, hoveredSelector?: string): string {
  const rules = [
    `[data-oc-node] { cursor: ${pickMode ? 'crosshair' : 'inherit'}; }`,
    '[data-oc-node]:hover { outline: 2px solid #3182ce !important; outline-offset: -2px; }',
  ]
  if (hoveredSelector !== undefined && hoveredSelector !== '') rules.push(`${hoveredSelector} { outline: 2px solid #dd6b20 !important; outline-offset: -2px; background: rgba(221,107,32,0.08) !important; }`)
  if (showHidden) rules.push('[data-oc-hidden] { display: revert !important; visibility: visible !important; opacity: 0.5 !important; outline: 1px dashed #ed8936 !important; }')

  return rules.join('\n')
}
