import { useRef, useState } from 'react'
import { Badge, Box, HStack, Spinner, Splitter, Switch, Text } from '@chakra-ui/react'
import type { OutlineView, RecipeListing } from '@opencraw/studio'
import { InspectorPanel } from '../inspector'
import { useInferSelectorMutation, useSnapshotQuery } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { listOutlineNodes, readCardNode, spliceTopLevel } from './outline-from-pick.mapper'
import { SnapshotFrame } from './snapshot-frame.component'

const STEP_PATH = 'start' // v1: only the start point is captured — see `page-snapshot`'s take-snapshot.use-case.ts.

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
        {snapshot.isFetching && <Spinner size='xs' />}
        {status !== undefined && <Badge size='sm' colorPalette={status.startsWith('List') || status.startsWith('Read') ? 'green' : 'orange'}>{status}</Badge>}
      </HStack>
      <Box flex='1' minH='0'>
        {snapshot.data !== undefined && !inspecting && (
          <SnapshotFrame
            html={snapshot.data.html}
            pickMode={pickMode}
            showHidden={showHidden}
            hoveredSelector={hoveredSelector}
            onHoverNode={setHoveredNodeId}
            onPickNode={(nodeId) => { void handlePick(nodeId) }}
          />
        )}
        {snapshot.data !== undefined && inspecting && (
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
