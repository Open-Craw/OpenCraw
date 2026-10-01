import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Box, HStack, Select, Table, Text, VStack, createListCollection } from '@chakra-ui/react'
import type { DeckDocumentView, DeckShapeView, DeckSlideView, GridSheetView, OutlineCard } from '@opencraw/studio'
import { CARD_DRAG_MIME, cardDragData } from '../steps-outline'
import { useDeckPreviewQuery, useRegionPreviewQuery } from '../studio-client'
import { columnHeaderText, columnKeyFrom, deckChartCardNode, deckTableCardNode, escapedRowPattern, fillDownKeyFor, filledGridOf, regionCardNode, regionIdFrom, regionSelector, rowPickText, shapeBox, slidePattern, unionBox } from './deck-pick.mapper'
import type { DeckDraft } from './deck-pick.mapper'
import type { PointsBox } from './pdf-pick.mapper'
import { REGION_COLOR, SelectionChip } from './selection-chip.component'
import { regionStepsAt, stepIdForChart, stepIdsForBox } from './step-highlight.mapper'
import type { PickedStep } from './step-highlight.mapper'

/** What clicking (or dragging) on the deck canvas is currently picking: a text box (issue #122, the default), or a `table` extract's header row(s), last row, column or fill-down group (studio plan §3.4, issue #94's 5d). "fillDown" only applies to a native table (a merged-cell group); a text-box grid has none. */
export type DeckPickMode = 'text' | 'header' | 'until' | 'column' | 'fillDown'
/** Which kind of table the current picks build: a slide's native table, or its text boxes laid out as a grid. */
export type DeckSource = 'table' | 'shapes'

export interface DeckCanvasProps {
  recipeId:       string
  /** The step path the snapshot (and this canvas's `deck-preview` calls) are cached against. */
  stepPath:       string
  /** The document's slides (`deck-view`). */
  view:           DeckDocumentView
  /** Called with the `table` extract card every time a slide/header/until/column/fillDown/shapes pick changes it. */
  onTablePick:    (card: OutlineCard) => void
  /** Called with the `jsonpath` extract card the moment a chart is picked (issue #94's 5d: a chart pick is a single click, not a multi-step draft). */
  onChartPick:    (card: OutlineCard) => void
  /** Called with a `region` extract card when a staged selection's "Add to recipe" is clicked (issue #122). */
  onRegionPick:   (card: OutlineCard) => void
  /** The recipe's extract steps, for drawing the regions and marking the charts already in it (issue #125); default none. */
  steps?:         readonly PickedStep[]
  /** The cross-panel highlight (issue #111): the step whose region or chart lights up. */
  hoveredStepId?: string
  /** Reports the step the text box (or chart) under the mouse belongs to (or `undefined`), the way the HTML canvas does. */
  onHoverStepId?: (stepId: string | undefined) => void
}

const NO_STEPS: readonly PickedStep[] = []

/** A selection staged on the canvas, not yet in the recipe: a box on one slide, previewed through `region-preview` until added or cleared. */
interface StagedRegion {
  slide: number
  box:   PointsBox
}

/** A drag in flight on the slide, in points (the slide is drawn at a point per pixel). */
interface DragBox {
  startX:   number
  startY:   number
  currentX: number
  currentY: number
}

const PREVIEW_ROW_LIMIT = 5
/** How far (in points, drawn as pixels) from a text box the pointer may be and still snap to it. */
const SNAP_DISTANCE = 24
/** A mouse that moved less than this between down and up clicked; more, and it dragged a box. */
const CLICK_SLOP = 4
const SNAP_COLOR = '#1d4ed8'
/** The colour of what is already in the recipe, the outline card's own highlight orange. */
const RECIPE_COLOR = '#ea580c'

/**
 * The deck canvas (studio plan §3.4, issue #94's 5d): every slide redrawn
 * from its shapes' own boxes (absolutely positioned, no bitmap rendering —
 * a deck's shapes are already just boxes with text, unlike a PDF page), with
 * a side list of its native tables, charts and notes.
 *
 * **Text** (issue #122, the default mode) is the PDF canvas's own: moving
 * the mouse snaps to the text box under or next to the pointer, a click
 * stages it, shift+click extends the selection to another box, dragging
 * stages the box drawn. The staged selection is previewed through
 * `region-preview` (the engine's own `slide=` reading, in the deck's points
 * — y down from the top, drawn here at a point per pixel, so no scale) and
 * sits there until "Add to recipe" appends its `region` card, its chip is
 * dragged onto the Steps tab, or it is cleared.
 *
 * The table modes build one `table` extract card incrementally, the same
 * header/until/column/fillDown flow `pdf-canvas.component.tsx`/`grid-canvas.component.tsx`
 * use — over a native table's own rows (reusing `grid-pick.mapper.ts`'s
 * helpers wholesale: a deck table *is* a sheet), or, in "Text-box grid"
 * mode, over a slide's shapes grouped into visual rows
 * (`deck-view.mapper.ts`'s own `shapeRows`, so a clicked shape's row and its
 * leftmost cell match `findDeckTables({ shapes: true })`'s own grouping at
 * run time). A chart pick is immediate: `onChartPick` fires a `jsonpath`
 * card addressing that chart's own `series`, no draft to build up.
 *
 * `onTablePick` fires the whole card again on every pick, so the caller can
 * upsert the one card in place (mirrors the PDF/grid canvases' own
 * "upgrade the last card" pattern).
 *
 * Cross-panel highlighting (issues #111, #125): every `region` step
 * reading this slide is drawn as a dashed box named after the step, and a
 * chart a `jsonpath` step reads carries the step's id in the side list;
 * hovering the step's card fills them in, and snapping to a text box one
 * of them reads (or hovering the chart) lights the card up.
 */
export function DeckCanvas ({ recipeId, stepPath, view, onTablePick, onChartPick, onRegionPick, steps = NO_STEPS, hoveredStepId, onHoverStepId }: DeckCanvasProps): React.ReactElement {
  const [slideIndex, setSlideIndex] = useState(0)
  const [source, setSource] = useState<DeckSource>('table')
  const [tableIndex, setTableIndex] = useState(0)
  const [mode, setMode] = useState<DeckPickMode>('text')
  const [draft, setDraft] = useState<DeckDraft>({})
  const [hoverShape, setHoverShape] = useState<DeckShapeView | undefined>(undefined)
  const [staged, setStaged] = useState<StagedRegion | undefined>(undefined)
  const [drag, setDrag] = useState<DragBox | undefined>(undefined)
  const reportedHoverRef = useRef<string | undefined>(undefined)

  const slide = view.slides[slideIndex]
  const recipeRegions = useMemo(() => regionStepsAt(steps, 'slide', slide?.number ?? -1), [steps, slide?.number])
  const chartStepIds = useMemo(() => (slide?.charts ?? []).map((_, index) => stepIdForChart(steps, slideIndex, index)), [steps, slide?.charts, slideIndex])
  const activeTable: GridSheetView | undefined = source === 'table' ? slide?.tables[tableIndex] : undefined
  const headerRowIndexes = draft.headerRowIndex === undefined ? undefined : Array.from({ length: draft.headerRows ?? 1 }, (_, index) => (draft.headerRowIndex as number) + index)

  const previewOptions = draft.header === undefined
    ? undefined
    : { slide: draft.slide, shapes: draft.shapes, header: draft.header, until: draft.until, columns: draft.columns, headerRows: draft.headerRows, fillDown: draft.fillDown, includeHidden: draft.includeHidden }
  const preview = useDeckPreviewQuery(recipeId, stepPath, previewOptions)
  const currentMatch = useMemo(() => preview.data?.matches.find(match => match.slide === slide?.number), [preview.data, slide?.number])

  const stagedSelector = staged === undefined ? undefined : regionSelector('slide', staged.slide, staged.box)
  const regionPreview = useRegionPreviewQuery(recipeId, stepPath, stagedSelector)
  const stagedMatch = regionPreview.data?.matches.find(match => match.page === staged?.slide)
  const stagedText = stagedMatch?.text

  useEffect(() => {
    if (draft.header === undefined) return
    onTablePick(deckTableCardNode(draft, stepPath))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onTablePick/stepPath identity churn should not re-fire the pick; only the draft's own content should (mirrors pdf-canvas.component.tsx's own table-draft effect).
  }, [draft])

  // A different slide starts a fresh pick: its own native table (if any) and text boxes are unrelated to whatever was being built for the last one.
  useEffect(() => {
    setTableIndex(0)
    setDraft({})
    setSource(slide !== undefined && slide.tables.length === 0 && slide.shapes.length > 0 ? 'shapes' : 'table')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a real slide change should reset the draft, not `slide`'s own identity churning every render.
  }, [slideIndex])

  if (slide === undefined) {
    return <Box p={4} color='fg.muted'><Text>This deck has no slides.</Text></Box>
  }

  function switchSource (next: DeckSource): void {
    if (next === source) return
    setSource(next)
    setDraft({})
  }

  function pickTableRow (rowIndex: number): void {
    if (activeTable === undefined) return
    const text = rowPickText(activeTable.rows[rowIndex])
    if (text === '') return
    if (mode === 'header') {
      setDraft((previous) => {
        if (previous.headerRowIndex !== undefined && rowIndex === previous.headerRowIndex + (previous.headerRows ?? 1)) {
          return { ...previous, headerRows: (previous.headerRows ?? 1) + 1 }
        }

        return { slide: slidePattern(slide.title ?? ''), includeHidden: previous.includeHidden, header: escapedRowPattern(text), headerRowIndex: rowIndex, headerRows: 1 }
      })

      return
    }
    if (mode === 'until' && draft.header !== undefined) setDraft(previous => ({ ...previous, until: escapedRowPattern(text) }))
  }

  function pickTableCell (rowIndex: number, columnIndex: number): void {
    if (activeTable === undefined || headerRowIndexes === undefined) return
    const filled = filledGridOf(activeTable)
    if (mode === 'column') {
      const text = columnHeaderText(filled, headerRowIndexes, columnIndex)
      if (text === '') return
      setDraft(previous => ({ ...previous, columns: { ...previous.columns, [columnKeyFrom(text)]: escapedRowPattern(text) } }))

      return
    }
    if (mode === 'fillDown' && isMergeLabel(activeTable, rowIndex, columnIndex)) {
      const text = columnHeaderText(filled, headerRowIndexes, columnIndex)
      if (text === '') return
      const key = fillDownKeyFor(draft, text)
      setDraft((previous) => {
        const existing = previous.fillDown ?? []
        if (existing.includes(key)) return previous

        return { ...previous, fillDown: [...existing, key] }
      })
    }
  }

  function pickShape (shapeIndex: number): void {
    const rowIndex = slide.shapeRows.findIndex(row => row.includes(shapeIndex))
    if (rowIndex === -1) return
    const row = slide.shapeRows[rowIndex]
    if (mode === 'header') {
      const text = slide.shapes[row[0]]?.text ?? ''
      if (text.trim() === '') return
      setDraft({ slide: slidePattern(slide.title ?? ''), shapes: true, header: escapedRowPattern(text), headerRowIndex: rowIndex, headerRows: 1 })

      return
    }
    if (mode === 'until') {
      if (draft.header === undefined) return
      const text = slide.shapes[row[0]]?.text ?? ''
      if (text.trim() === '') return
      setDraft(previous => ({ ...previous, until: escapedRowPattern(text) }))

      return
    }
    if (mode === 'column') {
      if (draft.headerRowIndex !== rowIndex) return
      const text = slide.shapes[shapeIndex]?.text ?? ''
      if (text.trim() === '') return
      setDraft(previous => ({ ...previous, columns: { ...previous.columns, [columnKeyFrom(text)]: escapedRowPattern(text) } }))
    }
  }

  function pickTable (index: number): void {
    setSource('table')
    setTableIndex(index)
    setDraft({})
  }

  function pickChart (chartIndex: number): void {
    onChartPick(deckChartCardNode(slideIndex, chartIndex, stepPath))
  }

  /** Stages `box` on this slide, or widens the current selection to hold it too when extending (shift). */
  function stage (box: PointsBox, extend: boolean): void {
    const current = staged
    setStaged(extend && current !== undefined && current.slide === slide.number ? { slide: slide.number, box: unionBox(current.box, box) } : { slide: slide.number, box })
  }

  /** Tells the other panels which step the mouse is over, once per change rather than per pixel. */
  function reportHover (stepId: string | undefined): void {
    if (onHoverStepId === undefined || reportedHoverRef.current === stepId) return
    reportedHoverRef.current = stepId
    onHoverStepId(stepId)
  }

  function handleMouseMove (event: React.MouseEvent<SVGSVGElement>): void {
    const point = slidePoint(event)
    if (drag !== undefined) {
      setDrag({ ...drag, currentX: point.x, currentY: point.y })

      return
    }
    const shape = nearestShape(slide, point)
    setHoverShape(shape)
    reportHover(shape === undefined ? undefined : stepIdsForBox(shapeBox(shape), recipeRegions)[0])
  }

  function handleMouseDown (event: React.MouseEvent<SVGSVGElement>): void {
    if (event.button !== 0) return
    const point = slidePoint(event)
    setDrag({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
  }

  function handleMouseUp (event: React.MouseEvent<SVGSVGElement>): void {
    if (drag === undefined) return
    const point = slidePoint(event)
    setDrag(undefined)
    const dragged = Math.abs(point.x - drag.startX) + Math.abs(point.y - drag.startY) > CLICK_SLOP
    if (dragged) {
      stage({ x1: drag.startX, y1: drag.startY, x2: point.x, y2: point.y }, event.shiftKey)

      return
    }
    const shape = nearestShape(slide, point)
    if (shape === undefined) {
      if (!event.shiftKey) setStaged(undefined)

      return
    }
    stage(shapeBox(shape), event.shiftKey)
  }

  /** The `region` card the staged selection would add — `undefined` until the preview has read something in the box. */
  function stagedCard (): OutlineCard | undefined {
    if (stagedSelector === undefined || stagedText === undefined) return undefined

    return regionCardNode(stagedSelector, stepPath, regionIdFrom(stagedText))
  }

  function addStaged (): void {
    const card = stagedCard()
    if (card === undefined) return
    onRegionPick(card)
    setStaged(undefined)
  }

  function handleChipDragStart (event: React.DragEvent<HTMLDivElement>): void {
    const card = stagedCard()
    if (card === undefined || stagedText === undefined) return
    event.dataTransfer.setData(CARD_DRAG_MIME, cardDragData(card))
    event.dataTransfer.setData('text/plain', stagedText)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const textMode = mode === 'text'
  const stagedOnThisSlide = staged !== undefined && staged.slide === slide.number ? staged : undefined

  return (
    <Box h='full' display='flex' flexDirection='column'>
      <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0} flexWrap='wrap'>
        {view.slides.length > 1 && <SlideSelect slides={view.slides} value={slideIndex} onChange={setSlideIndex} />}
        <ModeButton label='Text' active={textMode} onClick={() => { setMode('text') }} />
        {!textMode && <ModeButton label='Native table' active={source === 'table'} onClick={() => { switchSource('table') }} />}
        {!textMode && <ModeButton label='Text-box grid' active={source === 'shapes'} onClick={() => { switchSource('shapes') }} />}
        <ModeButton label='Header row(s)' active={mode === 'header'} onClick={() => { setMode('header') }} />
        <ModeButton label='Last row (until)' active={mode === 'until'} onClick={() => { setMode('until') }} />
        <ModeButton label='Column' active={mode === 'column'} onClick={() => { setMode('column') }} />
        {!textMode && source === 'table' && <ModeButton label='Fill down' active={mode === 'fillDown'} onClick={() => { setMode('fillDown') }} />}
        {textMode && staged === undefined && <Text fontSize='xs' color='fg.muted'>Click a text box (shift+click to extend) or drag a box, then add it to the recipe or drag it onto the Steps tab.</Text>}
        {draft.header !== undefined && <Badge size='sm' colorPalette='green'>{`table: ${draft.header}${draft.until === undefined ? '' : ` until ${draft.until}`}`}</Badge>}
        {preview.data?.error !== undefined && <Badge size='sm' colorPalette='orange'>{preview.data.error}</Badge>}
        {regionPreview.data?.error !== undefined && <Badge size='sm' colorPalette='orange'>{regionPreview.data.error}</Badge>}
      </HStack>
      <Box flex='1' minH='0' display='flex' overflow='hidden'>
        <Box flex='2' minW='0' overflow='auto' p={3}>
          {textMode && (
            <Box position='relative' width={`${String(view.width)}px`} height={`${String(view.height)}px`}>
              <SlideCanvas slide={slide} width={view.width} height={view.height} />
              <svg
                data-testid='deck-overlay'
                width={view.width}
                height={view.height}
                style={{ position: 'absolute', top: 0, left: 0, cursor: 'crosshair' }}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { setHoverShape(undefined); reportHover(undefined) }}
              >
                {recipeRegions.map(region => (
                  <rect
                    key={`recipe:${region.id}`}
                    data-testid='recipe-region'
                    data-step-id={region.id}
                    data-highlighted={region.id === hoveredStepId}
                    {...boxRect(region.box)}
                    fill={region.id === hoveredStepId ? 'rgba(234, 88, 12, 0.22)' : 'rgba(234, 88, 12, 0.05)'}
                    stroke={RECIPE_COLOR}
                    strokeWidth={region.id === hoveredStepId ? 2 : 1}
                    strokeDasharray={region.id === hoveredStepId ? undefined : '4 3'}
                    pointerEvents='none'
                  >
                    <title>{`In the recipe: ${region.id}`}</title>
                  </rect>
                ))}
                {hoverShape !== undefined && drag === undefined && (
                  <rect data-testid='snap-target' {...shapeRect(hoverShape)} fill='rgba(29, 78, 216, 0.08)' stroke={SNAP_COLOR} strokeWidth={1.5} strokeDasharray='3 2' pointerEvents='none' />
                )}
                {stagedOnThisSlide !== undefined && (
                  <rect data-testid='staged-region' {...boxRect(stagedOnThisSlide.box)} fill='rgba(155, 93, 229, 0.12)' stroke={REGION_COLOR} strokeWidth={1.5} pointerEvents='none' />
                )}
                {stagedOnThisSlide !== undefined && stagedMatch?.shapes.map(shape => (
                  <rect key={shapeKey(shape)} data-testid='staged-shape' {...shapeRect(shape)} fill='rgba(155, 93, 229, 0.28)' pointerEvents='none' />
                ))}
                {drag !== undefined && (
                  <rect {...boxRect({ x1: drag.startX, y1: drag.startY, x2: drag.currentX, y2: drag.currentY })} fill='rgba(155, 93, 229, 0.2)' stroke={REGION_COLOR} strokeDasharray='4 2' pointerEvents='none' />
                )}
              </svg>
              {stagedOnThisSlide !== undefined && (
                <SelectionChip
                  left={Math.min(stagedOnThisSlide.box.x1, stagedOnThisSlide.box.x2)}
                  top={Math.max(stagedOnThisSlide.box.y1, stagedOnThisSlide.box.y2) + 6}
                  text={stagedText}
                  loading={regionPreview.isPending}
                  onAdd={addStaged}
                  onClear={() => { setStaged(undefined) }}
                  onDragStart={handleChipDragStart}
                />
              )}
            </Box>
          )}
          {!textMode && source === 'shapes' && (
            <SlideCanvas slide={slide} width={view.width} height={view.height} headerRowIndex={draft.headerRowIndex} onPick={pickShape} />
          )}
          {!textMode && source === 'table' && activeTable !== undefined && (
            <NativeTableGrid table={activeTable} headerRowIndexes={headerRowIndexes} mode={mode} onRowPick={pickTableRow} onCellPick={pickTableCell} />
          )}
          {!textMode && source === 'table' && activeTable === undefined && (
            <Text color='fg.muted' fontSize='sm'>This slide has no native tables.</Text>
          )}
          {!textMode && currentMatch !== undefined && <DeckPreviewPanel match={currentMatch} />}
        </Box>
        <Box flex='1' minW='220px' maxW='320px' borderLeftWidth='1px' overflow='auto' p={3}>
          <SidePanel slide={slide} activeSource={source} activeTableIndex={tableIndex} onTablePick={pickTable} onChartPick={pickChart} chartStepIds={chartStepIds} hoveredStepId={hoveredStepId} onHoverStepId={reportHover} />
        </Box>
      </Box>
    </Box>
  )
}

/** A merge that starts at `(row, column)` and spans more than one row in exactly one column: a repeated group's own label, the `fillDown` pick target — mirrors `grid-canvas.component.tsx`'s own `isMergeLabel` logic. */
function isMergeLabel (table: GridSheetView, row: number, column: number): boolean {
  const merge = table.merges.find(candidate => candidate.top === row && candidate.left === column)

  return merge !== undefined && merge.bottom > merge.top && merge.left === merge.right
}

/** The pointer's position in the slide's points (drawn at a point per pixel), from the overlay's own top-left corner. */
function slidePoint (event: React.MouseEvent<SVGSVGElement>): { x: number, y: number } {
  const bounds = event.currentTarget.getBoundingClientRect()

  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

/** A stable React key for a text box: its position (shapes carry no id). */
function shapeKey (shape: DeckShapeView): string {
  return `staged:${String(shape.x)}:${String(shape.y)}`
}

/** A text box's rectangle as drawn: its own `x, y, width, height`, at least a point each way (as `SlideCanvas` draws it). */
function shapeRect (shape: DeckShapeView): { x: number, y: number, width: number, height: number } {
  return { x: shape.x, y: shape.y, width: Math.max(shape.width, 1), height: Math.max(shape.height, 1) }
}

/** A points box as a drawn rectangle (no y flip: a deck's points already grow downwards). */
function boxRect (box: PointsBox): { x: number, y: number, width: number, height: number } {
  const [x1, x2] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)]
  const [y1, y2] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)]

  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** The text box under the pointer, else the nearest one within `SNAP_DISTANCE` of its box; `undefined` on an empty stretch of slide. */
function nearestShape (slide: DeckSlideView, point: { x: number, y: number }): DeckShapeView | undefined {
  let best: { shape: DeckShapeView, distance: number } | undefined
  for (const shape of slide.shapes) {
    const rect = shapeRect(shape)
    const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
    const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))
    const distance = Math.hypot(dx, dy)
    if (distance <= SNAP_DISTANCE && (best === undefined || distance < best.distance)) best = { shape, distance }
  }

  return best?.shape
}

function ModeButton ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }): React.ReactElement {
  return (
    <Text
      as='button'
      fontSize='sm'
      fontWeight={active ? 'semibold' : 'normal'}
      color={active ? 'colorPalette.fg' : 'fg'}
      colorPalette='blue'
      cursor='pointer'
      onClick={onClick}
    >
      {label}
    </Text>
  )
}

function SlideSelect ({ slides, value, onChange }: { slides: readonly DeckSlideView[], value: number, onChange: (index: number) => void }): React.ReactElement {
  const collection = createListCollection({ items: slides.map((slide, index) => ({ label: `Slide ${String(slide.number)}${slide.title === undefined || slide.title === '' ? '' : ` — ${slide.title}`}${slide.hidden ? ' (hidden)' : ''}`, value: String(index) })) })

  return (
    <Select.Root collection={collection} size='sm' width='220px' value={[String(value)]} onValueChange={(details) => { onChange(Number(details.value[0])) }}>
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger><Select.ValueText /></Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          {collection.items.map(item => <Select.Item key={item.value} item={item}>{item.label}</Select.Item>)}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  )
}

interface SlideCanvasProps {
  slide:           DeckSlideView
  width:           number
  height:          number
  /** The currently picked header row's index into `slide.shapeRows`, highlighted; `undefined` before a header pick. */
  headerRowIndex?: number
  /** A text-box grid pick; absent in Text mode, where the overlay above the slide takes the mouse instead. */
  onPick?:         (shapeIndex: number) => void
}

/** The slide, redrawn from its shapes' own boxes — absolutely positioned `Box`es at their `x, y, width, height` (points treated as pixels; no bitmap rendering, a text box needs none). */
function SlideCanvas ({ slide, width, height, headerRowIndex, onPick }: SlideCanvasProps): React.ReactElement {
  const headerShapes = headerRowIndex === undefined ? undefined : new Set(slide.shapeRows[headerRowIndex])

  return (
    <Box position='relative' width={`${String(width)}px`} height={`${String(height)}px`} borderWidth='1px' bg='bg.panel'>
      {slide.shapes.map((shape, index) => (
        <Box
          key={`${String(shape.x)}:${String(shape.y)}:${String(index)}`}
          position='absolute'
          style={{ left: `${String(shape.x)}px`, top: `${String(shape.y)}px`, width: `${String(Math.max(shape.width, 1))}px`, height: `${String(Math.max(shape.height, 1))}px` }}
          borderWidth='1px'
          borderColor={headerShapes?.has(index) === true ? 'orange.fg' : 'border.muted'}
          bg={headerShapes?.has(index) === true ? 'orange.subtle' : 'bg'}
          overflow='hidden'
          px={1}
          fontSize='xs'
          cursor={onPick === undefined ? 'default' : 'pointer'}
          _hover={onPick === undefined ? undefined : { bg: 'bg.emphasized' }}
          onClick={onPick === undefined ? undefined : () => { onPick(index) }}
          title={shape.placeholder}
        >
          {shape.text}
        </Box>
      ))}
    </Box>
  )
}

interface NativeTableGridProps {
  table:            GridSheetView
  headerRowIndexes: readonly number[] | undefined
  mode:             DeckPickMode
  onRowPick:        (rowIndex: number) => void
  onCellPick:       (rowIndex: number, columnIndex: number) => void
}

/**
 * A native table's rows, plainly (a deck table is small — no virtualisation
 * needed, unlike `grid-canvas.component.tsx`'s own sheet grid): a merge's
 * covered cells already read `''` as the file stores them (`Sheet.rows`
 * keeps a merged range's value in its top-left cell only), so this needs no
 * `rowSpan`/`colSpan` math to read correctly, only to look visually
 * "spanned" — a tradeoff accepted for the deck canvas's own, smaller tables.
 */
function NativeTableGrid ({ table, headerRowIndexes, mode, onRowPick, onCellPick }: NativeTableGridProps): React.ReactElement {
  return (
    <Table.Root size='sm' variant='outline'>
      <Table.Body>
        {table.rows.map((row, rowIndex) => (
          <Table.Row key={rowIndex} bg={headerRowIndexes?.includes(rowIndex) === true ? 'yellow.subtle' : undefined}>
            {row.map((cell, columnIndex) => (
              <Table.Cell
                key={columnIndex}
                fontSize='xs'
                cursor='pointer'
                _hover={{ bg: 'bg.emphasized' }}
                onClick={() => { if (mode === 'header' || mode === 'until') onRowPick(rowIndex); else onCellPick(rowIndex, columnIndex) }}
              >
                {String(cell.value)}
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}

interface SidePanelProps {
  slide:            DeckSlideView
  activeSource:     DeckSource
  activeTableIndex: number
  onTablePick:      (tableIndex: number) => void
  onChartPick:      (chartIndex: number) => void
  /** Per chart, the id of the step already reading it (issue #125), or `undefined`. */
  chartStepIds:     readonly (string | undefined)[]
  hoveredStepId?:   string
  onHoverStepId:    (stepId: string | undefined) => void
}

/** The slide's native tables, charts and notes, listed beside the canvas (studio plan §3.4, issue #94's 5d). */
function SidePanel ({ slide, activeSource, activeTableIndex, onTablePick, onChartPick, chartStepIds, hoveredStepId, onHoverStepId }: SidePanelProps): React.ReactElement {
  return (
    <VStack align='stretch' gap={4}>
      <Box>
        <Text fontSize='xs' fontWeight='semibold' color='fg.muted' mb={1}>{`Native tables (${String(slide.tables.length)})`}</Text>
        {slide.tables.length === 0 && <Text fontSize='xs' color='fg.muted'>None on this slide.</Text>}
        <VStack align='stretch' gap={1}>
          {slide.tables.map((table, index) => (
            <Box
              key={table.name}
              as='button'
              textAlign='left'
              p={2}
              borderWidth='1px'
              borderRadius='sm'
              bg={activeSource === 'table' && activeTableIndex === index ? 'bg.emphasized' : undefined}
              onClick={() => { onTablePick(index) }}
            >
              <Text fontSize='xs' fontWeight='medium'>{table.name}</Text>
              <Text fontSize='2xs' color='fg.muted'>{`${String(table.rows.length)} rows`}</Text>
            </Box>
          ))}
        </VStack>
      </Box>
      <Box>
        <Text fontSize='xs' fontWeight='semibold' color='fg.muted' mb={1}>{`Charts (${String(slide.charts.length)})`}</Text>
        {slide.charts.length === 0 && <Text fontSize='xs' color='fg.muted'>None on this slide.</Text>}
        <VStack align='stretch' gap={1}>
          {slide.charts.map((chart, index) => (
            <Box
              key={index}
              as='button'
              data-testid='deck-chart'
              data-step-ids={chartStepIds[index]}
              data-highlighted={chartStepIds[index] !== undefined && chartStepIds[index] === hoveredStepId}
              textAlign='left'
              p={2}
              borderWidth='1px'
              borderRadius='sm'
              borderColor={chartStepIds[index] === undefined ? undefined : 'orange.solid'}
              borderStyle={chartStepIds[index] === undefined || chartStepIds[index] === hoveredStepId ? 'solid' : 'dashed'}
              bg={chartStepIds[index] !== undefined && chartStepIds[index] === hoveredStepId ? 'orange.subtle' : undefined}
              onClick={() => { onChartPick(index) }}
              onMouseEnter={() => { onHoverStepId(chartStepIds[index]) }}
              onMouseLeave={() => { onHoverStepId(undefined) }}
            >
              <HStack gap={1}>
                <Text fontSize='xs' fontWeight='medium'>{chart.title ?? chart.type}</Text>
                {chartStepIds[index] !== undefined && <Badge size='xs' colorPalette='orange' title='Already in the recipe: the step reading this'>{chartStepIds[index]}</Badge>}
              </HStack>
              <Text fontSize='2xs' color='fg.muted'>{`${chart.type} · ${String(chart.series.length)} series`}</Text>
            </Box>
          ))}
        </VStack>
      </Box>
      <Box>
        <Text fontSize='xs' fontWeight='semibold' color='fg.muted' mb={1}>Notes</Text>
        <Text fontSize='xs' color={slide.notes === '' ? 'fg.muted' : 'fg'} whiteSpace='pre-wrap'>{slide.notes === '' ? 'None.' : slide.notes}</Text>
      </Box>
    </VStack>
  )
}

function DeckPreviewPanel ({ match }: { match: { title: string, header: string[], rows: Record<string, string | number | boolean>[] } }): React.ReactElement {
  const rows = match.rows.slice(0, PREVIEW_ROW_LIMIT)

  return (
    <Box borderTopWidth='1px' mt={3} maxH='160px' overflow='auto'>
      <HStack px={0} py={1} gap={2}>
        <Text fontSize='xs' color='fg.muted'>{`Live preview: ${String(match.rows.length)} row${match.rows.length === 1 ? '' : 's'} matched${match.title === '' ? '' : ` ("${match.title}")`}`}</Text>
      </HStack>
      <Table.Root size='sm' variant='outline'>
        <Table.Header>
          <Table.Row>
            {match.header.map(key => <Table.ColumnHeader key={key} fontSize='2xs'>{key}</Table.ColumnHeader>)}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, index) => (
            <Table.Row key={index}>
              {match.header.map(key => <Table.Cell key={key} fontSize='2xs'>{String(row[key] ?? '')}</Table.Cell>)}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}
