import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Box, Button, HStack, Spinner, Splitter, Switch, Text } from '@chakra-ui/react'
import type { DocumentTreeNodeView, OutlineCard, OutlineView, RecipeListing } from '@opencraw/studio'
import { InspectorPanel, matchingNodeIds } from '../inspector'
import { allSteps, stepById } from '../steps-outline'
import type { GridViewOverride } from '../studio-client'
import { useDeckViewQuery, useDocumentTreeQuery, useGridViewQuery, useInferSelectorMutation, usePdfViewQuery, useSnapshotQuery, useStartRecordingMutation, useStopRecordingMutation, useStudioClient } from '../studio-client'
import { useRecordingStore, useStudioUiStore } from '../studio-store'
import { BlankSnapshotNotice } from './blank-snapshot-notice.component'
import { DeckCanvas } from './deck-canvas.component'
import { GridCanvas } from './grid-canvas.component'
import { addJsonListField, appendIndex, documentListOutlineNodes, documentReadCardNode, listOutlineNodes, paginateFromNextNode, readCardNode, spliceTopLevel } from './outline-from-pick.mapper'
import { PdfCanvas } from './pdf-canvas.component'
import { gotoCardNode, recipeStartUrl, suggestedBootstrap, suggestedStorageStatePath } from './recording-conversion.mapper'
import { SnapshotFrame } from './snapshot-frame.component'
import { pickedSteps } from './step-highlight.mapper'
import { TreeCanvas } from './tree-canvas.component'
import { hasVisibleContent } from './visible-content.algorithm'
import type { TreePickMode } from './tree-canvas.component'

/**
 * The css selector the cross-panel highlight's `hoveredStepId` (issue #111) currently means for the
 * snapshot iframe: the step in `outline` with that id, when it is a `css` extract (the only kind with a
 * `selector` a browser can match) — `undefined` for anything else (a different kind, an unmapped hover, no
 * outline yet), which `SnapshotFrame`'s own `hoveredSelector` prop already treats as "nothing highlighted".
 */
function selectorForStepId (outline: OutlineView | undefined, stepId: string | undefined): string | undefined {
  const selector = stepById(outline, stepId)?.step.selector

  return typeof selector === 'string' ? selector : undefined
}

/** The reverse direction: which step (by its own id) a hovered snapshot node belongs to, found by matching each `css` step's selector against the snapshot html until one contains this node id. Best-effort, same as `matchingNodeIds` itself: a node with no picked step yet, or one only a non-css step reads, resolves to `undefined`. */
function stepIdForNode (outline: OutlineView | undefined, html: string | undefined, nodeId: string): string | undefined {
  if (outline === undefined || html === undefined) return undefined
  for (const node of allSteps(outline)) {
    const selector = node.step.selector
    const id = node.step.id
    if (typeof selector !== 'string' || typeof id !== 'string') continue
    if (matchingNodeIds(html, selector).has(nodeId)) return id
  }

  return undefined
}

const STEP_PATH = 'start' // v1: only the start point is captured — see `page-snapshot`'s take-snapshot.use-case.ts.

/** The snapshot `format`s the tree canvas reads (studio plan §3.4, issue #94's 5a) — YAML and JSON Lines are both normalised to JSON by `http.client.ts`, so `document-tree` (and this canvas) handles them exactly like `json`. */
const TREE_FORMATS = new Set(['json', 'yaml', 'jsonl', 'xml'])
/** The snapshot `format`s the grid canvas reads (studio plan §3.4, issue #94's 5c). */
const GRID_FORMATS = new Set(['csv', 'xlsx'])
/** The snapshot `format` the deck canvas reads (studio plan §3.4, issue #94's 5d). */
const DECK_FORMATS = new Set(['pptx'])

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
  const client = useStudioClient()
  const format = snapshot.data?.format
  const isDocumentTree = format !== undefined && TREE_FORMATS.has(format)
  const isPdf = format === 'pdf'
  const isGrid = format !== undefined && GRID_FORMATS.has(format)
  const isDeck = format !== undefined && DECK_FORMATS.has(format)
  const isHtmlSnapshot = !isDocumentTree && !isPdf && !isGrid && !isDeck
  const snapshotHtml = snapshot.data?.html
  const snapshotHasContent = useMemo(() => snapshotHtml === undefined || hasVisibleContent(snapshotHtml), [snapshotHtml])
  const documentTree = useDocumentTreeQuery(recipeId, recipeId === undefined ? undefined : STEP_PATH, isDocumentTree)
  const pdfView = usePdfViewQuery(recipeId, recipeId === undefined ? undefined : STEP_PATH, isPdf)
  const [csvOverride, setCsvOverride] = useState<GridViewOverride | undefined>(undefined)
  const gridView = useGridViewQuery(recipeId, recipeId === undefined ? undefined : STEP_PATH, isGrid, csvOverride)
  const deckView = useDeckViewQuery(recipeId, recipeId === undefined ? undefined : STEP_PATH, isDeck)

  const pickTarget = useStudioUiStore(state => state.pickTarget)
  const showHidden = useStudioUiStore(state => state.showHidden)
  const hoveredStepId = useStudioUiStore(state => state.hoveredStepId)
  const startPicking = useStudioUiStore(state => state.startPicking)
  const stopPicking = useStudioUiStore(state => state.stopPicking)
  const registerPick = useStudioUiStore(state => state.registerPick)
  const setShowHidden = useStudioUiStore(state => state.setShowHidden)
  const setHoveredNodeId = useStudioUiStore(state => state.setHoveredNodeId)
  const setHoveredStepId = useStudioUiStore(state => state.setHoveredStepId)
  const hoveredSelector = useMemo(() => selectorForStepId(recipe?.outline, hoveredStepId), [recipe?.outline, hoveredStepId])
  const steps = useMemo(() => pickedSteps(recipe?.outline), [recipe?.outline])
  const handleHoverNode = (nodeId: string | undefined): void => {
    setHoveredNodeId(nodeId)
    setHoveredStepId(nodeId === undefined ? undefined : stepIdForNode(recipe?.outline, snapshot.data?.html, nodeId))
  }

  const recordingRecipeId = useRecordingStore(state => state.recipeId)
  const recordingActive = useRecordingStore(state => state.active)
  const recordingCardCount = useRecordingStore(state => state.cards.length)
  const recordingStoppedSteps = useRecordingStore(state => state.stoppedSteps)
  const recordingError = useRecordingStore(state => state.error)
  const dismissRecordingStopped = useRecordingStore(state => state.dismissStopped)
  const startRecording = useStartRecordingMutation()
  const stopRecording = useStopRecordingMutation()
  const isRecordingThis = recordingRecipeId === recipeId && recordingActive
  const recordingStoppedForThis = recordingRecipeId === recipeId ? recordingStoppedSteps : undefined

  const [status, setStatus] = useState<{ text: string, ok: boolean } | undefined>(undefined)
  const note = (text: string | undefined): void => { setStatus(text === undefined ? undefined : { text, ok: true }) }
  const warn = (text: string | undefined): void => { setStatus(text === undefined ? undefined : { text, ok: false }) }
  /** The top-level index a first pick's Read card landed at, so a following second pick upgrades it in place instead of adding a duplicate. */
  const insertedAtRef = useRef<number | undefined>(undefined)
  /** Same idea as `insertedAtRef`, but for the PDF, grid and deck canvases' `table` card (issue #94's 5b/5c/5d): every header/until/column/sheet/slide/fillDown/shapes pick re-sends the whole card, so it always replaces the same slot rather than piling up duplicates. Shared between the three canvases since only one of them is ever shown for a given recipe's format. */
  const tableInsertedAtRef = useRef<number | undefined>(undefined)

  const pickMode = pickTarget !== undefined && pickTarget.recipeId === recipeId

  // A different recipe means a different (or no) table card to upgrade in place, and a stale CSV override to drop.
  useEffect(() => {
    tableInsertedAtRef.current = undefined
    setCsvOverride(undefined)
  }, [recipeId])

  async function handlePick (nodeId: string): Promise<void> {
    if (recipeId === undefined) return
    const outcome = registerPick(nodeId)
    if (outcome.kind === 'first') {
      const result = await inferSelector.mutateAsync({ recipeId, path: STEP_PATH, nodeIds: [nodeId] })
      if (result.kind !== 'field') {
        warn(result.kind === 'unsupported' ? result.reason : undefined)

        return
      }
      await writeOutline((steps) => {
        insertedAtRef.current = appendIndex(steps)
        note(`Read card: ${result.field.selector} (${result.field.matches} match${result.field.matches === 1 ? '' : 'es'})`)

        return spliceTopLevel(steps, undefined, [readCardNode(result.field, `steps.${steps.length}`)])
      })

      return
    }
    const result = await inferSelector.mutateAsync({ recipeId, path: STEP_PATH, nodeIds: [outcome.firstNodeId, nodeId] })
    if (result.kind !== 'list') {
      warn(result.kind === 'unsupported' ? result.reason : undefined)

      return
    }
    await writeOutline((steps) => {
      const replaceAt = insertedAtRef.current
      insertedAtRef.current = undefined
      const at = replaceAt ?? appendIndex(steps)
      note(`List: ${result.item.selector} (${result.item.matches} items) → ${result.field.selector}`)

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
          note(`Paginate: next from ${node.jsonpath}`)

          return spliceTopLevel(steps, undefined, [bracket])
        })

        return
      }
      await writeOutline((steps) => {
        if (mode === 'list') {
          const withField = addJsonListField(steps, node)
          if (withField !== undefined) {
            note(`Added to the list: ${String(node.listPath)}`)

            return withField
          }
          const listNodes = documentListOutlineNodes(node, `steps.${appendIndex(steps)}`)
          if (listNodes !== undefined) {
            note(`List: ${String(node.listPath)} (${String(node.listCount ?? 0)} items)`)

            return spliceTopLevel(steps, undefined, listNodes)
          }
        }
        const card = documentReadCardNode(node, `steps.${steps.length}`, { generalize: mode === 'list', namespaces: documentTree.data?.namespaces })
        note(`Read card: ${card.step.selector}${mode === 'list' ? ` (${String(node.listCount ?? 0)} items)` : ''}`)

        return spliceTopLevel(steps, undefined, [card])
      })
    } catch (error) {
      warn(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Handles the PDF, grid and deck canvases' `table` card (issue #94's
   * 5b/5c/5d): every header/until/column/sheet/slide/shapes/fillDown pick
   * sends the whole card again, so it always replaces the same top-level slot
   * (`tableInsertedAtRef`) instead of piling up duplicates — the same
   * "upgrade in place" idea `handlePick`'s own `insertedAtRef` uses for the
   * DOM picker's two-click list shape.
   */
  async function handleTableCardPick (card: OutlineCard): Promise<void> {
    await writeOutline((steps) => {
      const replaceAt = tableInsertedAtRef.current
      const at = replaceAt ?? appendIndex(steps)
      tableInsertedAtRef.current = at
      note(`table: ${String(card.step.selector)}`)

      return spliceTopLevel(steps, replaceAt, [{ ...card, path: `steps.${at}` }])
    })
  }

  /** The PDF (issue #121), deck (issue #122) and grid (issue #123) canvases' "Add to recipe": a staged selection's card (a `region`, or a `jsonpath` into a sheet's cells), always a fresh one, never folded into the table draft's slot. */
  async function handleStagedPick (card: OutlineCard): Promise<void> {
    await writeOutline((steps) => {
      note(`${String(card.step.kind)}: ${String(card.step.id)} ← ${String(card.step.selector)}`)

      return spliceTopLevel(steps, undefined, [{ ...card, path: `steps.${steps.length}` }])
    })
  }

  /** A deck canvas chart pick (issue #94's 5d): a single-click `jsonpath` card, always a fresh one — a chart pick has no draft to upgrade in place, unlike the deck's own table card. */
  async function handleDeckChartPick (card: OutlineCard): Promise<void> {
    await writeOutline((steps) => {
      note(`jsonpath: ${String(card.step.selector)}`)

      return spliceTopLevel(steps, undefined, [{ ...card, path: `steps.${steps.length}` }])
    })
  }

  async function writeOutline (build: (steps: NonNullable<RecipeListing['outline']>['steps']) => NonNullable<RecipeListing['outline']>['steps']): Promise<void> {
    if (onSaveOutline === undefined || recipe?.outline === undefined) return
    const steps = build(recipe.outline.steps)
    await onSaveOutline(recipe.file, { ...recipe.outline, steps })
  }

  /** The "Record" button (issue #95, phase 6): opens the studio's own headed browser window on the recipe's own start point. */
  function handleStartRecording (): void {
    if (recipeId === undefined || recipe?.outline === undefined) return
    const url = recipeStartUrl(recipe.outline.recipe)
    if (url === undefined) {
      warn('this recipe has no start point to record from')

      return
    }
    startRecording.mutate({ recipeId, startUrl: url })
  }

  /**
   * "Make this the login" (issue #95): every step recorded becomes
   * `session.bootstrap`, `keep: ['cookies']` and a suggested `saveTo`
   * (`recording-conversion.mapper.ts`) — the recipe's own `steps` untouched.
   * There is no dedicated server command for this conversion (only
   * `recording.e2e.test.ts`'s own golden recipe proves the shape out), so it
   * is built here, against the same `save-outline` every other outline edit
   * in this pane already goes through.
   */
  async function handleMakeLogin (): Promise<void> {
    if (recordingStoppedForThis === undefined || recipe?.outline === undefined) return
    const startUrl = useRecordingStore.getState().startUrl
    if (startUrl === undefined) return
    const existingSessionValue = recipe.outline.recipe.session
    const existingSession = isRecord(existingSessionValue) ? existingSessionValue : {}
    const existingBootstrapValue = existingSession.bootstrap
    const existingBootstrap = isRecord(existingBootstrapValue) ? existingBootstrapValue : undefined
    const saveTo = suggestedStorageStatePath(recipe.file, recipeId ?? 'recipe')
    const session = { ...existingSession, bootstrap: suggestedBootstrap(startUrl, recordingStoppedForThis, existingBootstrap, saveTo) }
    await onSaveOutline?.(recipe.file, { ...recipe.outline, recipe: { ...recipe.outline.recipe, session } })
    note(`Made the login: session.bootstrap, ${recordingStoppedForThis.length} step${recordingStoppedForThis.length === 1 ? '' : 's'}`)
    dismissRecordingStopped()
  }

  /**
   * "Keep as steps" (issue #95): every card recorded — the same
   * `OutlineNode`s the Steps outline's own live section already renders
   * (`recording.store.ts`'s `cards`, one per `recording-stopped` step, in
   * the same order — never rebuilt from the raw JSON, which would lose their
   * real sentences) — after a `goto` back to the recording's own start
   * point, appended to the recipe's own top-level `steps`; never replacing
   * what was already there (`spliceTopLevel`, the same "append, don't
   * clobber" every pick in this pane already follows).
   */
  async function handleKeepAsSteps (): Promise<void> {
    if (recordingStoppedForThis === undefined || recipe?.outline === undefined) return
    const startUrl = useRecordingStore.getState().startUrl
    if (startUrl === undefined) return
    const cards = useRecordingStore.getState().cards
    await writeOutline((steps) => {
      const gotoNode = gotoCardNode(startUrl, `steps.${steps.length}`)

      return spliceTopLevel(steps, undefined, [gotoNode, ...cards.map(card => card.node)])
    })
    note(`Kept as steps: ${recordingStoppedForThis.length} step${recordingStoppedForThis.length === 1 ? '' : 's'}`)
    dismissRecordingStopped()
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
      <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0} minH='38px'>
        {!isDocumentTree && !isPdf && !isGrid && !isDeck && (
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
            <Text
              as='button'
              fontSize='sm'
              fontWeight={isRecordingThis ? 'semibold' : 'normal'}
              color={isRecordingThis ? 'red.fg' : 'fg'}
              colorPalette='red'
              cursor='pointer'
              onClick={() => { if (isRecordingThis) stopRecording.mutate(); else handleStartRecording() }}
            >
              {isRecordingThis ? 'Stop recording' : 'Record'}
            </Text>
          </>
        )}
        {isDocumentTree && <Text fontSize='sm' color='fg.muted'>Click a value to read it; [*] reads every item of a list.</Text>}
        {(snapshot.isFetching || (isDocumentTree && documentTree.isFetching) || (isPdf && pdfView.isFetching) || (isGrid && gridView.isFetching) || (isDeck && deckView.isFetching)) && <Spinner size='xs' />}
        {status !== undefined && (
          <Badge size='sm' colorPalette={status.ok ? 'green' : 'orange'}>
            {status.text}
          </Badge>
        )}
      </HStack>
      {isRecordingThis && (
        <HStack px={3} py={2} bg='red.subtle' color='red.fg' fontSize='sm' gap={3} flexShrink={0} data-testid='recording-banner'>
          <Box w='8px' h='8px' borderRadius='full' bg='red.solid' flexShrink={0} />
          <Text>Recording — a browser window opened for you to drive; interact with it, not with the snapshot below.</Text>
          <Badge size='sm' colorPalette='red'>{recordingCardCount} step{recordingCardCount === 1 ? '' : 's'}</Badge>
        </HStack>
      )}
      {recordingError !== undefined && recordingRecipeId === recipeId && (
        <Box px={3} py={1} bg='red.subtle' color='red.fg' fontSize='sm' flexShrink={0}>{recordingError}</Box>
      )}
      {recordingStoppedForThis !== undefined && (
        <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0} data-testid='recording-stopped-bar'>
          <Text fontSize='sm'>
            Recording stopped: {recordingStoppedForThis.length} step{recordingStoppedForThis.length === 1 ? '' : 's'} recorded.
          </Text>
          <Button size='xs' colorPalette='blue' onClick={() => { void handleMakeLogin() }} disabled={recordingStoppedForThis.length === 0}>
            Make this the login
          </Button>
          <Button size='xs' variant='outline' onClick={() => { void handleKeepAsSteps() }} disabled={recordingStoppedForThis.length === 0}>
            Keep as steps
          </Button>
          <Button size='xs' variant='ghost' onClick={dismissRecordingStopped}>
            Discard
          </Button>
        </HStack>
      )}
      {isHtmlSnapshot && snapshot.data !== undefined && !snapshotHasContent && <BlankSnapshotNotice />}
      <Box flex='1' minH='0'>
        {isDocumentTree && documentTree.data !== undefined && (
          <TreeCanvas tree={documentTree.data} onPick={(node, mode) => { void handleTreePick(node, mode) }} steps={steps} hoveredStepId={hoveredStepId} onHoverStepId={setHoveredStepId} />
        )}
        {isDocumentTree && documentTree.isError && (
          <Box p={4} color='fg.error'><Text>{documentTree.error.message}</Text></Box>
        )}
        {isPdf && pdfView.data !== undefined && (
          <PdfCanvas
            recipeId={recipeId}
            stepPath={STEP_PATH}
            view={pdfView.data}
            bytesUrl={client.pdfBytesUrl(recipeId, STEP_PATH)}
            onTablePick={(card) => { void handleTableCardPick(card) }}
            onRegionPick={(card) => { void handleStagedPick(card) }}
            steps={steps}
            hoveredStepId={hoveredStepId}
            onHoverStepId={setHoveredStepId}
          />
        )}
        {isPdf && pdfView.isError && (
          <Box p={4} color='fg.error'><Text>{pdfView.error.message}</Text></Box>
        )}
        {isGrid && gridView.data !== undefined && (
          <GridCanvas
            recipeId={recipeId}
            stepPath={STEP_PATH}
            view={gridView.data}
            onTablePick={(card) => { void handleTableCardPick(card) }}
            onCellPick={(card) => { void handleStagedPick(card) }}
            steps={steps}
            hoveredStepId={hoveredStepId}
            onHoverStepId={setHoveredStepId}
            csvOverride={csvOverride}
            onCsvOverrideChange={setCsvOverride}
          />
        )}
        {isGrid && gridView.isError && (
          <Box p={4} color='fg.error'><Text>{gridView.error.message}</Text></Box>
        )}
        {isDeck && deckView.data !== undefined && (
          <DeckCanvas
            recipeId={recipeId}
            stepPath={STEP_PATH}
            view={deckView.data}
            onTablePick={(card) => { void handleTableCardPick(card) }}
            onChartPick={(card) => { void handleDeckChartPick(card) }}
            onRegionPick={(card) => { void handleStagedPick(card) }}
            steps={steps}
            hoveredStepId={hoveredStepId}
            onHoverStepId={setHoveredStepId}
          />
        )}
        {isDeck && deckView.isError && (
          <Box p={4} color='fg.error'><Text>{deckView.error.message}</Text></Box>
        )}
        {!isDocumentTree && !isPdf && !isGrid && !isDeck && snapshot.data !== undefined && !inspecting && (
          <SnapshotFrame
            html={snapshot.data.html}
            pickMode={pickMode}
            showHidden={showHidden}
            hoveredSelector={hoveredSelector}
            onHoverNode={handleHoverNode}
            onPickNode={(nodeId) => { void handlePick(nodeId) }}
          />
        )}
        {!isDocumentTree && !isPdf && !isGrid && !isDeck && snapshot.data !== undefined && inspecting && (
          <Splitter.Root panels={[{ id: 'snapshot', minSize: 15 }, { id: 'inspect', minSize: 20 }]} h='full'>
            <Splitter.Panel id='snapshot' overflow='hidden'>
              <SnapshotFrame
                html={snapshot.data.html}
                pickMode={pickMode}
                showHidden={showHidden}
                hoveredSelector={hoveredSelector}
                onHoverNode={handleHoverNode}
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
        {snapshot.isError && (
          <Box p={4} color='fg.error' role='alert'>
            <Text fontWeight='semibold'>Could not take a snapshot of this recipe's page.</Text>
            <Text>{snapshot.error.message}</Text>
          </Box>
        )}
        {!snapshot.isFetching && !snapshot.isError && snapshot.data === undefined && (
          <Box p={4} color='fg.muted'><Text>Run a sample, or open a recipe, to see its snapshot here.</Text></Box>
        )}
      </Box>
    </Box>
  )
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
