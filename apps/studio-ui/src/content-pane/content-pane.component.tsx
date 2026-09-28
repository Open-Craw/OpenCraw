import { useRef, useState } from 'react'
import { Badge, Box, HStack, Spinner, Splitter, Switch, Text } from '@chakra-ui/react'
import type { DocumentTreeNodeView, OutlineView, RecipeListing } from '@opencraw/studio'
import { InspectorPanel } from '../inspector'
import { useDocumentTreeQuery, useInferSelectorMutation, useSnapshotQuery } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { documentReadCardNode, listOutlineNodes, paginateFromNextNode, readCardNode, spliceTopLevel } from './outline-from-pick.mapper'
import { SnapshotFrame } from './snapshot-frame.component'
import { TreeCanvas } from './tree-canvas.component'
import type { TreePickMode } from './tree-canvas.component'

const STEP_PATH = 'start' // v1: only the start point is captured — see `page-snapshot`'s take-snapshot.use-case.ts.

/** The snapshot `format`s the tree canvas reads (studio plan §3.4, issue #94's 5a) — YAML and JSON Lines are both normalised to JSON by `http.client.ts`, so `document-tree` (and this canvas) handles them exactly like `json`. */
const TREE_FORMATS = new Set(['json', 'yaml', 'jsonl', 'xml'])
/** Formats with no canvas yet (PDF cells, the workbook grid, the deck — issue #94's 5b/5c/5d): shown as an honest "not yet" placeholder instead of the snapshot iframe's misleading placeholder text (`page-snapshot`'s own `textOf`). */
const UNSUPPORTED_DOCUMENT_FORMATS = new Set(['pdf', 'csv', 'xlsx', 'pptx'])

export interface ContentPaneProps {
  /** The selected recipe, with its outline — `undefined` before one is picked. */
  recipe?:        RecipeListing
  /** Saves an edited outline (the same call `steps-outline` makes); picking writes through this, not a separate path. */
  onSaveOutline?: (path: string, outline: OutlineView) => Promise<void>
  /** Saves the recipe's raw JSON; the Inspect panel's "responses seen" tab writes through this when a pick switches the recipe to api mode (issue #93). */
  onSaveRecipe?:  (path: string, recipe: unknown) => Promise<void>
}

/**
 * The content pane: the snapshot of the selected recipe's start point
 * (`take-snapshot`), shown in a sandboxed iframe with the picker overlay
 * wired in (studio plan §3.1/§3.2, issue #91). Pick mode, the hidden-elements
 * toggle and the two-way-highlight hover state live in `studio-store`'s
 * `useStudioUiStore` (phase 2's marked slot there).
 *
 * v1's insertion point: a pick always writes to the *end* of the recipe's
 * own top-level steps (`outline-from-pick.mapper.ts`'s `spliceTopLevel`),
 * never inside an existing `forEach`/`if` scope a person may have selected
 * in the Steps outline — picking into a nested scope is a real gap this
 * phase did not close (see the final report).
 */
export function ContentPane ({ recipe, onSaveOutline, onSaveRecipe }: ContentPaneProps): React.ReactElement {
  const recipeId = recipe?.id
  const snapshot = useSnapshotQuery(recipeId, recipeId === undefined ? undefined : STEP_PATH)
  const inferSelector = useInferSelectorMutation()
  const [inspecting, setInspecting] = useState(false)
  const format = snapshot.data?.format
  const isDocumentTree = format !== undefined && TREE_FORMATS.has(format)
  const isUnsupportedDocument = format !== undefined && UNSUPPORTED_DOCUMENT_FORMATS.has(format)
  const documentTree = useDocumentTreeQuery(recipeId, recipeId === undefined ? undefined : STEP_PATH, isDocumentTree)

  const pickTarget = useStudioUiStore(state => state.pickTarget)
  const showHidden = useStudioUiStore(state => state.showHidden)
  const hoveredSelector = useStudioUiStore(state => state.hoveredSelector)
  const startPicking = useStudioUiStore(state => state.startPicking)
  const stopPicking = useStudioUiStore(state => state.stopPicking)
  const registerPick = useStudioUiStore(state => state.registerPick)
  const setShowHidden = useStudioUiStore(state => state.setShowHidden)
  const setHoveredNodeId = useStudioUiStore(state => state.setHoveredNodeId)

  const [status, setStatus] = useState<string | undefined>(undefined)
  /** The top-level index a first pick's Read card landed at, so a following second pick upgrades it in place instead of adding a duplicate. */
  const insertedAtRef = useRef<number | undefined>(undefined)

  const pickMode = pickTarget !== undefined && pickTarget.recipeId === recipeId

  async function handlePick (nodeId: string): Promise<void> {
    if (recipeId === undefined) return
    const outcome = registerPick(nodeId)
    if (outcome.kind === 'first') {
      const result = await inferSelector.mutateAsync({ recipeId, path: STEP_PATH, nodeIds: [nodeId] })
      if (result.kind !== 'field') {
        setStatus(result.kind === 'unsupported' ? result.reason : undefined)

        return
      }
      await writeOutline((steps) => {
        insertedAtRef.current = steps.length
        setStatus(`Read card: ${result.field.selector} (${result.field.matches} match${result.field.matches === 1 ? '' : 'es'})`)

        return spliceTopLevel(steps, undefined, [readCardNode(result.field, `steps.${steps.length}`)])
      })

      return
    }
    const result = await inferSelector.mutateAsync({ recipeId, path: STEP_PATH, nodeIds: [outcome.firstNodeId, nodeId] })
    if (result.kind !== 'list') {
      setStatus(result.kind === 'unsupported' ? result.reason : undefined)

      return
    }
    await writeOutline((steps) => {
      const replaceAt = insertedAtRef.current
      insertedAtRef.current = undefined
      const at = replaceAt ?? steps.length
      setStatus(`List: ${result.item.selector} (${result.item.matches} items) → ${result.field.selector}`)

      return spliceTopLevel(steps, replaceAt, listOutlineNodes(result, `steps.${at}`))
    })
  }

  /**
   * Handles a tree canvas pick (studio plan §3.4, issue #94's 5a): `value`
   * and `list` both write a Read card (`documentReadCardNode`, generalised
   * to `listPath` for `list`); `next` writes an empty `paginate` bracket
   * instead (`paginateFromNextNode`). Always appended at the end of the
   * recipe's top-level steps — a document tree pick has none of the DOM
   * picker's two-click "upgrade the last card in place" behaviour (there is
   * no second pick to combine with; the tree already knows the exact list).
   */
  async function handleTreePick (node: DocumentTreeNodeView, mode: TreePickMode): Promise<void> {
    if (recipeId === undefined) return
    try {
      if (mode === 'next') {
        await writeOutline((steps) => {
          const bracket = paginateFromNextNode(node, `steps.${steps.length}`)
          setStatus(`Paginate: next from ${node.jsonpath}`)

          return spliceTopLevel(steps, undefined, [bracket])
        })

        return
      }
      await writeOutline((steps) => {
        const card = documentReadCardNode(node, `steps.${steps.length}`, { generalize: mode === 'list', namespaces: documentTree.data?.namespaces })
        setStatus(`Read card: ${card.step.selector}${mode === 'list' ? ` (${String(node.listCount ?? 0)} items)` : ''}`)

        return spliceTopLevel(steps, undefined, [card])
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function writeOutline (build: (steps: NonNullable<RecipeListing['outline']>['steps']) => NonNullable<RecipeListing['outline']>['steps']): Promise<void> {
    if (onSaveOutline === undefined || recipe?.outline === undefined) return
    const steps = build(recipe.outline.steps)
    await onSaveOutline(recipe.file, { ...recipe.outline, steps })
  }

  if (recipeId === undefined) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>Pick a recipe to see its snapshot here.</Text>
      </Box>
    )
  }

  function togglePicking (): void {
    if (pickMode) {
      stopPicking()

      return
    }
    insertedAtRef.current = undefined
    startPicking(recipeId as string, STEP_PATH)
  }

  return (
    <Box h='full' display='flex' flexDirection='column'>
      <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0}>
        {!isDocumentTree && !isUnsupportedDocument && (
          <>
            <Text
              as='button'
              fontSize='sm'
              fontWeight={pickMode ? 'semibold' : 'normal'}
              color={pickMode ? 'colorPalette.fg' : 'fg'}
              colorPalette='blue'
              cursor='pointer'
              onClick={togglePicking}
            >
              {pickMode ? 'Cancel pick' : 'Read'}
            </Text>
            <Switch.Root checked={showHidden} onCheckedChange={(details) => { setShowHidden(details.checked) }} size='sm'>
              <Switch.HiddenInput />
              <Switch.Control />
              <Switch.Label fontSize='sm'>Show hidden</Switch.Label>
            </Switch.Root>
            <Text
              as='button'
              fontSize='sm'
              fontWeight={inspecting ? 'semibold' : 'normal'}
              color={inspecting ? 'colorPalette.fg' : 'fg'}
              colorPalette='purple'
              cursor='pointer'
              onClick={() => { setInspecting(value => !value) }}
            >
              {inspecting ? 'Hide inspector' : 'Inspect'}
            </Text>
          </>
        )}
        {isDocumentTree && <Text fontSize='sm' color='fg.muted'>Click a value to read it; [*] reads every item of a list.</Text>}
        {(snapshot.isFetching || (isDocumentTree && documentTree.isFetching)) && <Spinner size='xs' />}
        {status !== undefined && <Badge size='sm' colorPalette={status.startsWith('List') || status.startsWith('Read') || status.startsWith('Paginate') ? 'green' : 'orange'}>{status}</Badge>}
      </HStack>
      <Box flex='1' minH='0'>
        {isDocumentTree && documentTree.data !== undefined && (
          <TreeCanvas tree={documentTree.data} onPick={(node, mode) => { void handleTreePick(node, mode) }} />
        )}
        {isDocumentTree && documentTree.isError && (
          <Box p={4} color='fg.error'><Text>{documentTree.error.message}</Text></Box>
        )}
        {isUnsupportedDocument && (
          <Box p={4} color='fg.muted'>
            <Text>{`This recipe reads a "${format}" document — its canvas is not built yet (studio plan §3.4).`}</Text>
          </Box>
        )}
        {!isDocumentTree && !isUnsupportedDocument && snapshot.data !== undefined && !inspecting && (
          <SnapshotFrame
            html={snapshot.data.html}
            pickMode={pickMode}
            showHidden={showHidden}
            hoveredSelector={hoveredSelector}
            onHoverNode={setHoveredNodeId}
            onPickNode={(nodeId) => { void handlePick(nodeId) }}
          />
        )}
        {!isDocumentTree && !isUnsupportedDocument && snapshot.data !== undefined && inspecting && (
          <Splitter.Root panels={[{ id: 'snapshot', minSize: 15 }, { id: 'inspect', minSize: 20 }]} h='full'>
            <Splitter.Panel id='snapshot' overflow='hidden'>
              <SnapshotFrame
                html={snapshot.data.html}
                pickMode={pickMode}
                showHidden={showHidden}
                hoveredSelector={hoveredSelector}
                onHoverNode={setHoveredNodeId}
                onPickNode={(nodeId) => { void handlePick(nodeId) }}
              />
            </Splitter.Panel>
            <Splitter.ResizeTrigger id='snapshot:inspect' />
            <Splitter.Panel id='inspect' overflow='hidden'>
              <InspectorPanel
                recipeId={recipeId}
                recipe={recipe}
                snapshot={snapshot.data}
                onSaveOutline={onSaveOutline}
                onSaveRecipe={onSaveRecipe}
              />
            </Splitter.Panel>
          </Splitter.Root>
        )}
        {!snapshot.isFetching && snapshot.data === undefined && (
          <Box p={4} color='fg.muted'><Text>Run a sample, or open a recipe, to see its snapshot here.</Text></Box>
        )}
      </Box>
    </Box>
  )
}
