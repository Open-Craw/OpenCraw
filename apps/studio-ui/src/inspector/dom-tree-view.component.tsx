import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Box } from '@chakra-ui/react'
import type { DomTreeNodeView } from '@opencraw/studio'
import { flattenTree } from './flatten-tree.mapper'
import { TreeRow } from './tree-row.component'

export interface DomTreeViewProps {
  tree:              DomTreeNodeView
  showHidden:        boolean
  query:             string
  expanded:          ReadonlySet<string>
  onToggle:          (nodeId: string) => void
  /** A pill's colour for a node matching one of the recipe's own bound ids' selectors, or the currently hovered Steps card's selector. */
  nodeColors:        ReadonlyMap<string, string>
  hoveredNodeId?:    string
  onHoverNode:       (nodeId: string | undefined) => void
  onPickNode:        (nodeId: string) => void
  onContextMenuNode: (node: DomTreeNodeView, x: number, y: number) => void
}

const ROW_HEIGHT = 22
const OVERSCAN = 20

/**
 * The Inspect panel's DOM tree (studio plan §3.3, issue #93), virtualized
 * with `@tanstack/react-virtual`: a real page's snapshot can carry tens of
 * thousands of nodes (`dom-tree.mapper.ts` already collapses long identical
 * runs, but a big page is still thousands of rows), so only the rows near
 * the viewport are ever mounted.
 */
export function DomTreeView ({ tree, showHidden, query, expanded, onToggle, nodeColors, hoveredNodeId, onHoverNode, onPickNode, onContextMenuNode }: DomTreeViewProps): React.ReactElement {
  const parentRef = useRef<HTMLDivElement>(null)
  const rows = flattenTree(tree, expanded, query, showHidden)
  const virtualizer = useVirtualizer({
    count:            rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize:     () => ROW_HEIGHT,
    overscan:         OVERSCAN,
  })

  return (
    <Box ref={parentRef} h='full' overflow='auto'>
      <Box h={`${virtualizer.getTotalSize()}px`} position='relative'>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (row === undefined) return null

          return (
            <Box key={row.key} position='absolute' top={0} left={0} w='full' style={{ transform: `translateY(${item.start}px)` }}>
              <TreeRow
                row={row}
                highlightColor={nodeColors.get(row.node.nodeId)}
                hovered={hoveredNodeId === row.node.nodeId}
                onToggle={() => { onToggle(row.node.nodeId) }}
                onHover={(hovering) => { onHoverNode(hovering ? row.node.nodeId : undefined) }}
                onClick={() => { onPickNode(row.node.nodeId) }}
                onContextMenu={(event) => { event.preventDefault(); onContextMenuNode(row.node, event.clientX, event.clientY) }}
              />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
