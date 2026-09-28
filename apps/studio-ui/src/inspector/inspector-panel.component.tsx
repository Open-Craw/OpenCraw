import { useEffect, useMemo, useState } from 'react'
import { Badge, Box, HStack, Input, Text } from '@chakra-ui/react'
import type { DomTreeNodeView, ObservedResponseView, OutlineCard, OutlineView, PageDataFindingView, RecipeListing, SnapshotView } from '@opencraw/studio'
import { readCardNode, spliceTopLevel } from '../content-pane/outline-from-pick.mapper'
import { hashColor } from '../steps-outline/hash-color'
import { useInferSelectorMutation, useInspectPageQuery, useResponsesSeenMutation } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { DomTreeView } from './dom-tree-view.component'
import type { NodeMenuChoice } from './node-context-menu.component'
import { NodeContextMenu } from './node-context-menu.component'
import { matchingNodeIds } from './node-matches.mapper'
import { PageDataList } from './page-data-list.component'
import { pageDataPickNodes } from './pick-from-finding.mapper'
import { ResponsesSeenList } from './responses-seen-list.component'
import { apiModeFromResponse } from './switch-to-api-mode.mapper'

type InspectorTab = 'tree' | 'data' | 'responses'

const STEP_PATH = 'start' // v1: only the start point has a snapshot — see page-snapshot's take-snapshot.use-case.ts.
const HOVERED_SELECTOR_COLOR = '#dd6b20' // mirrors picker-style.mapper.ts's own hovered-card colour, for the same two-way highlight in the tree.

export interface InspectorPanelProps {
  recipeId?:      string
  /** The recipe, with its outline: `undefined` (fields not-picked) leaves picking disabled but still shows the tree/data/responses. */
  recipe?:        RecipeListing
  /** The content pane's own snapshot — passed down rather than refetched, so the Inspect panel never captures on its own. */
  snapshot?:      SnapshotView
  /** Saves an edited outline (the same call `content-pane`/`steps-outline` make); a tree/data-in-page pick writes through this. */
  onSaveOutline?: (path: string, outline: OutlineView) => Promise<void>
  /** Saves the recipe's raw JSON; a "responses seen" pick (switching to api mode) writes through this instead of `onSaveOutline` — it replaces `mode`/`start`/`steps` wholesale, not a single card. */
  onSaveRecipe?:  (path: string, recipe: unknown) => Promise<void>
}

/**
 * The Inspect panel (studio plan §3.3, issue #93): the DOM tree beside the
 * rendered view, "data in the page" and "responses seen" apart from it.
 * Reuses phase 2's snapshot (`snapshot` prop, the same one the content pane
 * shows) and phase 1-3's `Read` card/pill mechanism (`readCardNode`,
 * `spliceTopLevel` from `content-pane/outline-from-pick.mapper.ts`) rather
 * than a parallel one: a tree pick calls the same `infer-selector` command a
 * content-pane click does, off the node id the tree already carries
 * (`data-oc-node`, shared with the snapshot iframe).
 */
export function InspectorPanel ({ recipeId, recipe, snapshot, onSaveOutline, onSaveRecipe }: InspectorPanelProps): React.ReactElement {
  const [tab, setTab] = useState<InspectorTab>('tree')
  const [query, setQuery] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [contextMenu, setContextMenu] = useState<{ node: DomTreeNodeView, x: number, y: number } | undefined>(undefined)
  const [status, setStatus] = useState<string | undefined>(undefined)

  const hoveredSelector = useStudioUiStore(state => state.hoveredSelector)
  const hoveredNodeId = useStudioUiStore(state => state.hoveredNodeId)
  const setHoveredNodeId = useStudioUiStore(state => state.setHoveredNodeId)

  const inspectPage = useInspectPageQuery(recipeId, STEP_PATH, snapshot !== undefined)
  const inferSelector = useInferSelectorMutation()
  const responsesSeen = useResponsesSeenMutation()

  const nodeColors = useMemo(() => {
    const colors = new Map<string, string>()
    if (snapshot === undefined) return colors
    const steps = recipe?.outline?.steps ?? []
    for (const node of steps) {
      if (node.kind !== 'card') continue
      const step = node.step as { type?: unknown, id?: unknown, selector?: unknown, kind?: unknown }
      if (step.type !== 'extract' || step.kind !== 'css' || typeof step.id !== 'string' || typeof step.selector !== 'string') continue
      for (const nodeId of matchingNodeIds(snapshot.html, step.selector)) colors.set(nodeId, hashColor(step.id))
    }
    if (hoveredSelector !== undefined && hoveredSelector !== '') {
      for (const nodeId of matchingNodeIds(snapshot.html, hoveredSelector)) colors.set(nodeId, HOVERED_SELECTOR_COLOR)
    }

    return colors
  }, [snapshot, recipe, hoveredSelector])

  useEffect(() => {
    // A new recipe/step: forget which nodes were expanded, so a stale id from the last tree does not linger.
    setExpanded(new Set())
  }, [recipeId])

  useEffect(() => {
    if (inspectPage.data === undefined) return
    // Auto-expand the root (and its one child, when it has exactly one — html > body, almost always) so opening
    // the tree does not start on a single collapsed row; deeper nodes are left for the person (or a search) to reveal.
    setExpanded((current) => {
      if (current.size > 0) return current
      const root = inspectPage.data.tree
      const next = new Set([root.nodeId])
      const [onlyChild] = root.children
      if (onlyChild !== undefined && root.children.length === 1) next.add(onlyChild.nodeId)

      return next
    })
  }, [inspectPage.data])

  function toggleExpanded (nodeId: string): void {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)

      return next
    })
  }

  async function appendCards (cards: OutlineCard[]): Promise<void> {
    if (onSaveOutline === undefined || recipe?.outline === undefined) return
    const steps = spliceTopLevel(recipe.outline.steps, undefined, cards)
    await onSaveOutline(recipe.file, { ...recipe.outline, steps })
  }

  async function pickNode (nodeId: string, takeOverride?: string): Promise<void> {
    if (recipeId === undefined) return
    const result = await inferSelector.mutateAsync({ recipeId, path: STEP_PATH, nodeIds: [nodeId] })
    if (result.kind !== 'field') {
      setStatus(result.kind === 'unsupported' ? result.reason : undefined)

      return
    }
    const field = takeOverride === undefined ? result.field : { ...result.field, take: takeOverride }
    await appendCards([readCardNode(field, 'steps.0')])
    setStatus(`Read card: ${field.selector}`)
  }

  async function pickRegexOnText (nodeId: string): Promise<void> {
    if (recipeId === undefined) return
    const result = await inferSelector.mutateAsync({ recipeId, path: STEP_PATH, nodeIds: [nodeId] })
    if (result.kind !== 'field') return
    const rawId = 'text'
    const raw = readCardNode({ ...result.field, take: 'text' }, 'steps.0', rawId)
    const drill: OutlineCard = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: `${rawId}_match`, from: rawId, selector: '', kind: 'regex' } }
    await appendCards([raw, drill])
    setStatus(`Read card: ${result.field.selector} → regex (fill the pattern in its form)`)
  }

  async function pickPageData (finding: PageDataFindingView, key: string | undefined): Promise<void> {
    await appendCards(pageDataPickNodes(finding, 'steps.0', key))
    setStatus(`Read card: ${finding.selector}${key === undefined ? '' : ` → $.${key}`}`)
  }

  async function pickResponse (response: ObservedResponseView): Promise<void> {
    if (onSaveRecipe === undefined || recipe === undefined) return
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(recipe.text) as Record<string, unknown>
    } catch {
      setStatus('The recipe\'s JSON does not parse; fix it in the JSON tab first')

      return
    }
    const vars = isRecord(parsed.vars) ? parsed.vars : undefined
    const patch = apiModeFromResponse(response, vars)
    await onSaveRecipe(recipe.file, { ...parsed, ...patch })
    setStatus(`Switched to api mode: ${patch.start[0].url}`)
  }

  function handleMenuChoice (choice: NodeMenuChoice): void {
    if (contextMenu === undefined) return
    const nodeId = contextMenu.node.nodeId
    setContextMenu(undefined)
    if (choice.kind === 'regex') void pickRegexOnText(nodeId)
    else void pickNode(nodeId, choice.take)
  }

  return (
    <Box h='full' display='flex' flexDirection='column'>
      <HStack px={2} py={1} borderBottomWidth='1px' gap={2} flexShrink={0}>
        <TabButton label='Tree' active={tab === 'tree'} onClick={() => { setTab('tree') }} />
        <TabButton label='Data in page' active={tab === 'data'} count={inspectPage.data?.pageData.length} onClick={() => { setTab('data') }} />
        <TabButton label='Responses' active={tab === 'responses'} count={responsesSeen.data?.responses.length} onClick={() => { setTab('responses') }} />
      </HStack>
      {tab === 'tree' && (
        <HStack px={2} py={1} borderBottomWidth='1px' gap={2} flexShrink={0}>
          <Input size='xs' placeholder='Search by tag, class or text…' value={query} onChange={(event) => { setQuery(event.target.value) }} />
          <Text
            as='button'
            fontSize='xs'
            color={showHidden ? 'colorPalette.fg' : 'fg.muted'}
            colorPalette='orange'
            whiteSpace='nowrap'
            onClick={() => { setShowHidden(value => !value) }}
          >
            {showHidden ? 'Hide hidden' : 'Show hidden'}
          </Text>
        </HStack>
      )}
      {status !== undefined && <Box px={2} py='2px' fontSize='xs' color='fg.muted' borderBottomWidth='1px' flexShrink={0}>{status}</Box>}
      <Box flex='1' minH='0' position='relative'>
        {tab === 'tree' && inspectPage.data !== undefined && (
          <DomTreeView
            tree={inspectPage.data.tree}
            showHidden={showHidden}
            query={query}
            expanded={expanded}
            onToggle={toggleExpanded}
            nodeColors={nodeColors}
            hoveredNodeId={hoveredNodeId}
            onHoverNode={setHoveredNodeId}
            onPickNode={(nodeId) => { void pickNode(nodeId) }}
            onContextMenuNode={(node, x, y) => { setContextMenu({ node, x, y }) }}
          />
        )}
        {tab === 'tree' && inspectPage.isFetching && <Box p={3} color='fg.muted' fontSize='sm'>Inspecting…</Box>}
        {tab === 'data' && (
          <PageDataList findings={inspectPage.data?.pageData ?? []} onPick={(finding, key) => { void pickPageData(finding, key) }} />
        )}
        {tab === 'responses' && (
          <ResponsesSeenList
            responses={responsesSeen.data?.responses}
            loading={responsesSeen.isPending}
            error={responsesSeen.error?.message}
            onCheck={() => { if (recipeId !== undefined) responsesSeen.mutate({ recipeId, path: STEP_PATH }) }}
            onPick={(response) => { void pickResponse(response) }}
          />
        )}
        {contextMenu !== undefined && (
          <NodeContextMenu
            node={contextMenu.node}
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => { setContextMenu(undefined) }}
            onChoose={handleMenuChoice}
          />
        )}
      </Box>
    </Box>
  )
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function TabButton ({ label, active, count, onClick }: { label: string, active: boolean, count?: number, onClick: () => void }): React.ReactElement {
  return (
    <HStack
      as='button'
      gap={1}
      px={2}
      py='2px'
      borderRadius='sm'
      fontSize='xs'
      fontWeight={active ? 'semibold' : 'normal'}
      color={active ? 'fg' : 'fg.muted'}
      bg={active ? 'bg.emphasized' : undefined}
      onClick={onClick}
    >
      <Text as='span'>{label}</Text>
      {count !== undefined && <Badge size='xs'>{count}</Badge>}
    </HStack>
  )
}
