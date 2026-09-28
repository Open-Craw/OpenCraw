import { useState } from 'react'
import { Badge, Box, HStack, Text } from '@chakra-ui/react'
import type { DocumentTreeNodeView, DocumentTreeView } from '@opencraw/studio'

/** What a document tree pick asks the content pane to do (studio plan §3.4, issue #94's 5a). */
export type TreePickMode = 'value' | 'list' | 'next'

export interface TreeCanvasProps {
  tree:   DocumentTreeView
  onPick: (node: DocumentTreeNodeView, mode: TreePickMode) => void
}

const TYPE_COLOR: Record<DocumentTreeNodeView['valueType'], string> = {
  object:  'purple.fg',
  array:   'purple.fg',
  element: 'purple.fg',
  string:  'green.fg',
  number:  'orange.fg',
  boolean: 'blue.fg',
  null:    'fg.muted',
}

/**
 * The tree canvas (studio plan §3.4, issue #94's 5a): the parsed JSON/YAML/
 * XML document `document-view/tree-view.mapper.ts` built, one row per value
 * or element/attribute. A row click picks its exact `jsonpath`/`xpath`; a
 * node inside a list (its `listPath` is set) also offers "the whole list",
 * with the count already shown; a leaf offers "use as pagination next" for
 * `paginate`'s `next.jsonpath` (JSON/YAML only — see `paginateFromNextNode`).
 * Not virtualised: unlike the Inspect panel's DOM tree or the workbook grid
 * (5c), a parsed JSON/XML document is not usually large enough to need it.
 */
export function TreeCanvas ({ tree, onPick }: TreeCanvasProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  function toggle (id: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)

      return next
    })
  }

  return (
    <Box h='full' overflow='auto' fontFamily='mono' fontSize='xs' py={2}>
      {tree.namespaces !== undefined && Object.keys(tree.namespaces).length > 0 && (
        <HStack px={2} pb={2} gap={2} flexWrap='wrap'>
          <Text color='fg.muted'>Namespaces:</Text>
          {Object.entries(tree.namespaces).map(([prefix, uri]) => (
            <Badge key={prefix} size='xs' colorPalette='gray'>{`${prefix}: ${uri}`}</Badge>
          ))}
        </HStack>
      )}
      <TreeCanvasNode node={tree.root} depth={0} collapsed={collapsed} onToggle={toggle} onPick={onPick} />
    </Box>
  )
}

interface NodeProps {
  node:      DocumentTreeNodeView
  depth:     number
  collapsed: ReadonlySet<string>
  onToggle:  (id: string) => void
  onPick:    (node: DocumentTreeNodeView, mode: TreePickMode) => void
}

function TreeCanvasNode ({ node, depth, collapsed, onToggle, onPick }: NodeProps): React.ReactElement {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isLeaf = node.valueType !== 'object' && node.valueType !== 'array' && node.valueType !== 'element'

  return (
    <>
      <HStack
        gap={1}
        pl={`${depth * 14 + 4}px`}
        pr={2}
        minH='20px'
        cursor='pointer'
        _hover={{ bg: 'bg.emphasized' }}
        onClick={() => { onPick(node, 'value') }}
      >
        {hasChildren
          ? (
              <Text
                as='button'
                w='12px'
                flexShrink={0}
                color='fg.muted'
                onClick={(event) => { event.stopPropagation(); onToggle(node.id) }}
              >
                {isCollapsed ? '▸' : '▾'}
              </Text>
            )
          : <Box w='12px' flexShrink={0} />}
        <Text as='span' color={TYPE_COLOR[node.valueType]} fontWeight='medium'>{node.label}</Text>
        {isLeaf && node.preview !== undefined && <Text as='span' color='fg.muted' truncate>{node.preview}</Text>}
        {node.listPath !== undefined && (
          <Badge
            as='button'
            size='xs'
            colorPalette='blue'
            onClick={(event) => { event.stopPropagation(); onPick(node, 'list') }}
            title={`Read every one of the ${String(node.listCount ?? 0)} items in this list`}
          >
            {`[*] ×${String(node.listCount ?? 0)}`}
          </Badge>
        )}
        {isLeaf && node.jsonpath !== undefined && (
          <Text
            as='button'
            fontSize='2xs'
            color='fg.muted'
            _hover={{ color: 'fg', textDecoration: 'underline' }}
            onClick={(event) => { event.stopPropagation(); onPick(node, 'next') }}
            title='Use as the pagination "next" cursor/URL'
          >
            next →
          </Text>
        )}
      </HStack>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeCanvasNode key={child.id} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} onPick={onPick} />
      ))}
    </>
  )
}
