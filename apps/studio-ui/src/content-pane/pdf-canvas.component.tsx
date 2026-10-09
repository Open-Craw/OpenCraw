import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Box, HStack, Select, Text, createListCollection } from '@chakra-ui/react'
import type { OutlineCard, PdfCellView, PdfDocumentView, PdfPageView, PdfRowView, TablePreviewMatchView } from '@opencraw/studio'
import { CARD_DRAG_MIME, cardDragData } from '../steps-outline'
import { useRegionPreviewQuery, useTablePreviewQuery } from '../studio-client'
import { cellBox, columnKeyFrom, escapedRowPattern, regionCardNode, regionIdFrom, regionSelector, tableCardNode, unionBox } from './pdf-pick.mapper'
import type { PointsBox, TableDraft } from './pdf-pick.mapper'
import { REGION_COLOR, SelectionChip } from './selection-chip.component'
import { regionStepsAt, stepIdsForBox } from './step-highlight.mapper'
import type { PickedStep } from './step-highlight.mapper'

/** What clicking (or dragging) on the PDF canvas is currently picking: a line of text (issue #121, the default), or a `table` extract's header row, last row or column (issue #94's 5b). */
export type PdfPickMode = 'text' | 'header' | 'until' | 'column'

export interface PdfCanvasProps {
  recipeId:       string
  /** The step path the snapshot (and this canvas's `table-preview`/`region-preview` calls) are cached against. */
  stepPath:       string
  /** The document's cells and rows (`pdf-view`). */
  view:           PdfDocumentView
  /** Where `pdf.js` fetches the raw bytes to render (`GET /api/pdf-bytes`). */
  bytesUrl:       string
  /** Called with the `table` extract card every time a header/until/column pick changes it. */
  onTablePick:    (card: OutlineCard) => void
  /** Called with a `region` extract card when a staged selection's "Add to recipe" is clicked (issue #121). */
  onRegionPick:   (card: OutlineCard) => void
  /** The recipe's extract steps, for drawing the regions already in it (issue #125); default none. */
  steps?:         readonly PickedStep[]
  /** The cross-panel highlight (issue #111): the step whose region lights up. */
  hoveredStepId?: string
  /** Reports the region step the line under the mouse belongs to (or `undefined`), the way the HTML canvas does. */
  onHoverStepId?: (stepId: string | undefined) => void
}

const NO_STEPS: readonly PickedStep[] = []

/** A selection staged on the canvas, not yet in the recipe: a box on one page, previewed through `region-preview` until added or cleared. */
interface StagedRegion {
  page: number
  box:  PointsBox
}

/** A drag in flight on the canvas, in canvas pixels. */
interface DragBox {
  startX:   number
  startY:   number
  currentX: number
  currentY: number
}

/** Rendering scale: PDF points -> canvas pixels (mirrors `capture.mjs`'s `pdfFigure`, whose scale is also 2 by default). */
const SCALE = 1.5
/** `pdfFigure`'s own cell-box padding: a cell is drawn a bit taller than its own font-size height. */
const CELL_HEIGHT_PAD = 1.2
/** How far (in pixels) from a cell's box the pointer may be and still snap to it. */
const SNAP_DISTANCE = 24
/** A mouse that moved less than this (in pixels) between down and up clicked; more, and it dragged a box. */
const CLICK_SLOP = 4
const ROW_COLORS = ['#2e86ab', '#3bb273']
const HEADER_COLOR = '#e4572e'
const MATCH_FILL = 'rgba(59, 178, 115, 0.18)'
const SNAP_COLOR = '#1d4ed8'
/** The colour of what is already in the recipe, the outline card's own highlight orange. */
const RECIPE_COLOR = '#ea580c'

/**
 * The PDF canvas (studio plan §3.4, issue #94's 5b): the page `pdf.js`
 * renders, with every cell `readPdf` found outlined and each row in
 * alternating colours — porting `docs/how-it-works/capture/capture.mjs`'s
 * `pdfFigure` drawing math to React, over an SVG overlay (rather than a
 * second canvas) so hit-testing is plain DOM event handling.
 *
 * **Text** (issue #121, the default mode): moving the mouse snaps to the
 * nearest line of text (the cell under or next to the pointer), a click
 * stages it as a selection, shift+click extends the selection to another
 * line, dragging stages the box drawn. A staged selection is previewed
 * through `region-preview` — the engine's own reading, so the highlighted
 * cells and the text in the chip are exactly what the step will bind — and
 * sits there until "Add to recipe" appends its `region` card, the chip is
 * dragged onto the Steps tab (the same card, dropped), or it is cleared.
 * Nothing is written to the recipe before that.
 *
 * **Table** modes build one `table` extract card incrementally: the header
 * row's click gives `selector`, the boundary ("last") row's click gives
 * `until`, a column band's click adds to `columns` — `onTablePick` fires the
 * whole card again each time, so the caller can upsert the one card in
 * place. Its live preview comes from `table-preview`.
 *
 * Cross-panel highlighting (issues #111, #125): every `region` step
 * reading this page is drawn as a dashed box named after the step;
 * hovering the step's card fills it in, and snapping to a line one of
 * them reads lights the card up.
 */
export function PdfCanvas ({ recipeId, stepPath, view, bytesUrl, onTablePick, onRegionPick, steps = NO_STEPS, hoveredStepId, onHoverStepId }: PdfCanvasProps): React.ReactElement {
  const [pageIndex, setPageIndex] = useState(0)
  const [mode, setMode] = useState<PdfPickMode>('text')
  const [draft, setDraft] = useState<TableDraft>({})
  const [hoverCell, setHoverCell] = useState<PdfCellView | undefined>(undefined)
  const [staged, setStaged] = useState<StagedRegion | undefined>(undefined)
  const [drag, setDrag] = useState<DragBox | undefined>(undefined)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reportedHoverRef = useRef<string | undefined>(undefined)

  const page = view.pages[pageIndex]
  const recipeRegions = useMemo(() => regionStepsAt(steps, 'page', page?.number ?? -1), [steps, page?.number])
  const width = page === undefined ? 0 : Math.ceil(page.width * SCALE)
  const height = page === undefined ? 0 : Math.ceil(page.height * SCALE)

  const previewOptions = draft.header === undefined ? undefined : { header: draft.header, until: draft.until, columns: draft.columns }
  const preview = useTablePreviewQuery(recipeId, stepPath, previewOptions)
  const currentMatch = useMemo(
    () => preview.data?.matches.find(match => match.page === page?.number),
    [preview.data, page?.number],
  )

  const stagedSelector = staged === undefined ? undefined : regionSelector('page', staged.page, staged.box)
  const regionPreview = useRegionPreviewQuery(recipeId, stepPath, stagedSelector)
  const stagedMatch = regionPreview.data?.matches.find(match => match.page === staged?.page)
  const stagedText = stagedMatch?.text

  useEffect(() => {
    if (draft.header === undefined) return
    onTablePick(tableCardNode(draft, stepPath))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onTablePick/stepPath identity churn should not re-fire the pick; only the draft's own content should.
  }, [draft])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || page === undefined) return
    const controller = new AbortController()
    void renderPdfPage(canvas, bytesUrl, page.number, SCALE, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) console.error('PDF canvas: could not render the page', error)
    })

    return () => { controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-render only on a real page change (`page.number`), not on `view`'s own identity churning every render.
  }, [bytesUrl, page?.number])

  if (page === undefined) {
    return <Box p={4} color='fg.muted'><Text>This PDF has no pages.</Text></Box>
  }

  function pickHeaderOrUntil (row: PdfRowView): void {
    const text = row.cells[0]?.text ?? ''
    if (mode === 'header') {
      setDraft({ header: escapedRowPattern(text) })

      return
    }
    if (mode === 'until' && draft.header !== undefined) setDraft(previous => ({ ...previous, until: escapedRowPattern(text) }))
  }

  function pickColumn (bandName: string): void {
    if (draft.header === undefined) return
    setDraft(previous => ({ ...previous, columns: { ...previous.columns, [columnKeyFrom(bandName)]: escapedRowPattern(bandName) } }))
  }

  /** Stages `box` on this page, or widens the current selection to hold it too when extending (shift). */
  function stage (box: PointsBox, extend: boolean): void {
    const current = staged
    setStaged(extend && current !== undefined && current.page === page.number ? { page: page.number, box: unionBox(current.box, box) } : { page: page.number, box })
  }

  /** Tells the other panels which step the mouse is over, once per change rather than per pixel. */
  function reportHover (stepId: string | undefined): void {
    if (onHoverStepId === undefined || reportedHoverRef.current === stepId) return
    reportedHoverRef.current = stepId
    onHoverStepId(stepId)
  }

  function handleMouseMove (event: React.MouseEvent<SVGSVGElement>): void {
    if (mode !== 'text') return
    const point = pixelPoint(event)
    if (drag !== undefined) {
      setDrag({ ...drag, currentX: point.x, currentY: point.y })

      return
    }
    const cell = nearestCell(page, point)
    setHoverCell(cell)
    reportHover(cell === undefined ? undefined : stepIdsForBox(cellBox(cell), recipeRegions)[0])
  }

  function handleMouseDown (event: React.MouseEvent<SVGSVGElement>): void {
    if (mode !== 'text' || event.button !== 0) return
    const point = pixelPoint(event)
    setDrag({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
  }

  function handleMouseUp (event: React.MouseEvent<SVGSVGElement>): void {
    if (mode !== 'text' || drag === undefined) return
    const point = pixelPoint(event)
    setDrag(undefined)
    const dragged = Math.abs(point.x - drag.startX) + Math.abs(point.y - drag.startY) > CLICK_SLOP
    if (dragged) {
      stage(pointsBox(page, drag.startX, drag.startY, point.x, point.y), event.shiftKey)

      return
    }
    const cell = nearestCell(page, point)
    if (cell === undefined) {
      if (!event.shiftKey) setStaged(undefined)

      return
    }
    stage(cellBox(cell), event.shiftKey)
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
  const stagedOnThisPage = staged !== undefined && staged.page === page.number ? staged : undefined

  return (
    <Box h='full' display='flex' flexDirection='column'>
      <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0} flexWrap='wrap'>
        {view.pages.length > 1 && <PageSelect pages={view.pages.length} value={pageIndex} onChange={setPageIndex} />}
        <ModeButton label='Text' active={textMode} onClick={() => { setMode('text') }} />
        <ModeButton label='Header row' active={mode === 'header'} onClick={() => { setMode('header') }} />
        <ModeButton label='Last row (until)' active={mode === 'until'} onClick={() => { setMode('until') }} />
        <ModeButton label='Column' active={mode === 'column'} onClick={() => { setMode('column') }} />
        <Text fontSize='xs' color='fg.muted'>{`${String(page.rowCount)} rows, ${String(page.cellCount)} cells${page.hasTextLayer ? '' : ' — no text layer (a scan?)'}`}</Text>
        {textMode && <Text fontSize='xs' color='fg.muted' visibility={staged === undefined ? 'visible' : 'hidden'}>Click a line (shift+click to extend) or drag a box, then add it to the recipe or drag it onto the Steps tab.</Text>}
        {draft.header !== undefined && <Badge size='sm' colorPalette='green'>{`table: ${draft.header}${draft.until === undefined ? '' : ` until ${draft.until}`}`}</Badge>}
        {preview.data?.error !== undefined && <Badge size='sm' colorPalette='orange'>{preview.data.error}</Badge>}
        {regionPreview.data?.error !== undefined && <Badge size='sm' colorPalette='orange'>{regionPreview.data.error}</Badge>}
      </HStack>
      <Box flex='1' minH='0' overflow='auto' position='relative'>
        <Box position='relative' width={`${String(width)}px`} height={`${String(height)}px`}>
          <canvas ref={canvasRef} width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} />
          <svg
            data-testid='pdf-overlay'
            width={width}
            height={height}
            style={{ position: 'absolute', top: 0, left: 0, cursor: textMode ? 'crosshair' : 'pointer' }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setHoverCell(undefined); reportHover(undefined) }}
          >
            {recipeRegions.map(region => (
              <rect
                key={`recipe:${region.id}`}
                data-testid='recipe-region'
                data-step-id={region.id}
                data-highlighted={region.id === hoveredStepId}
                {...boxRect(region.box, page.height)}
                fill={region.id === hoveredStepId ? 'rgba(234, 88, 12, 0.22)' : 'rgba(234, 88, 12, 0.05)'}
                stroke={RECIPE_COLOR}
                strokeWidth={region.id === hoveredStepId ? 2 : 1}
                strokeDasharray={region.id === hoveredStepId ? undefined : '4 3'}
                pointerEvents='none'
              >
                <title>{`In the recipe: ${region.id}`}</title>
              </rect>
            ))}
            {page.rows.map((row, index) => (
              <RowOverlay
                key={`${String(row.top)}:${String(row.bottom)}`}
                row={row}
                colour={row.cells[0]?.text !== undefined && currentMatch?.headerRowIndex === index ? HEADER_COLOR : ROW_COLORS[index % 2]}
                highlighted={currentMatch?.matchedRowIndices.includes(index) ?? false}
                scale={SCALE}
                pageHeight={page.height}
                cursor={textMode ? 'crosshair' : 'pointer'}
                onClick={textMode ? undefined : () => { pickHeaderOrUntil(row) }}
              />
            ))}
            {mode === 'column' && currentMatch !== undefined && currentMatch.bands.map(band => (
              <BandOverlay key={band.column} band={band} scale={SCALE} pageHeight={page.height} onClick={() => { pickColumn(band.name) }} />
            ))}
            {textMode && hoverCell !== undefined && drag === undefined && (
              <rect data-testid='snap-target' {...cellRect(hoverCell, page.height)} fill='rgba(29, 78, 216, 0.08)' stroke={SNAP_COLOR} strokeWidth={1.5} strokeDasharray='3 2' pointerEvents='none' />
            )}
            {stagedOnThisPage !== undefined && (
              <rect data-testid='staged-region' {...boxRect(stagedOnThisPage.box, page.height)} fill='rgba(155, 93, 229, 0.12)' stroke={REGION_COLOR} strokeWidth={1.5} pointerEvents='none' />
            )}
            {stagedOnThisPage !== undefined && stagedMatch?.cells.map(cell => (
              <rect key={cellKey(cell)} data-testid='staged-cell' {...cellRect(cell, page.height)} fill='rgba(155, 93, 229, 0.28)' pointerEvents='none' />
            ))}
            {drag !== undefined && (
              <rect
                x={Math.min(drag.startX, drag.currentX)}
                y={Math.min(drag.startY, drag.currentY)}
                width={Math.abs(drag.currentX - drag.startX)}
                height={Math.abs(drag.currentY - drag.startY)}
                fill='rgba(155, 93, 229, 0.2)'
                stroke={REGION_COLOR}
                strokeDasharray='4 2'
                pointerEvents='none'
              />
            )}
          </svg>
          {stagedOnThisPage !== undefined && (
            <SelectionChip
              left={Math.min(stagedOnThisPage.box.x1, stagedOnThisPage.box.x2) * SCALE}
              top={(page.height - Math.min(stagedOnThisPage.box.y1, stagedOnThisPage.box.y2)) * SCALE + 6}
              text={stagedText}
              loading={regionPreview.isPending}
              onAdd={addStaged}
              onClear={() => { setStaged(undefined) }}
              onDragStart={handleChipDragStart}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}

/** The pointer's position in canvas pixels, from the overlay's own top-left corner. */
function pixelPoint (event: React.MouseEvent<SVGSVGElement>): { x: number, y: number } {
  const bounds = event.currentTarget.getBoundingClientRect()

  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

/** A stable React key for a cell: its position (cells carry no id). */
function cellKey (cell: PdfCellView): string {
  return `staged:${String(cell.x)}:${String(cell.y)}`
}

/** A cell's box in canvas pixels, `pdfFigure`'s own math: `left = x * scale`, `top = (pageHeight - y - height) * scale`, drawn `height * scale * 1.2` tall. */
function cellRect (cell: PdfCellView, pageHeight: number): { x: number, y: number, width: number, height: number } {
  return { x: cell.x * SCALE, y: (pageHeight - cell.y - cell.height) * SCALE, width: Math.max(cell.width, 1) * SCALE, height: cell.height * SCALE * CELL_HEIGHT_PAD }
}

/** A points box in canvas pixels (y flips: points grow upwards, pixels downwards). */
function boxRect (box: PointsBox, pageHeight: number): { x: number, y: number, width: number, height: number } {
  const [x1, x2] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)]
  const [y1, y2] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)]

  return { x: x1 * SCALE, y: (pageHeight - y2) * SCALE, width: (x2 - x1) * SCALE, height: (y2 - y1) * SCALE }
}

/** A dragged pixel rectangle as a points box on the page. */
function pointsBox (page: PdfPageView, x1: number, y1: number, x2: number, y2: number): PointsBox {
  return { x1: x1 / SCALE, y1: page.height - y1 / SCALE, x2: x2 / SCALE, y2: page.height - y2 / SCALE }
}

/** The cell under the pointer, else the nearest one within `SNAP_DISTANCE` pixels of its box; `undefined` on an empty stretch of page. */
function nearestCell (page: PdfPageView, point: { x: number, y: number }): PdfCellView | undefined {
  let best: { cell: PdfCellView, distance: number } | undefined
  for (const row of page.rows) {
    for (const cell of row.cells) {
      const rect = cellRect(cell, page.height)
      const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
      const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))
      const distance = Math.hypot(dx, dy)
      if (distance <= SNAP_DISTANCE && (best === undefined || distance < best.distance)) best = { cell, distance }
    }
  }

  return best?.cell
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

function PageSelect ({ pages, value, onChange }: { pages: number, value: number, onChange: (index: number) => void }): React.ReactElement {
  const collection = createListCollection({ items: Array.from({ length: pages }, (_, index) => ({ label: `Page ${String(index + 1)}`, value: String(index) })) })

  return (
    <Select.Root
      collection={collection}
      size='sm'
      width='140px'
      value={[String(value)]}
      onValueChange={(details) => { onChange(Number(details.value[0])) }}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger><Select.ValueText /></Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          {collection.items.map(item => (
            <Select.Item key={item.value} item={item}>{item.label}</Select.Item>
          ))}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  )
}

interface RowOverlayProps {
  row:         PdfRowView
  colour:      string
  highlighted: boolean
  scale:       number
  pageHeight:  number
  cursor:      string
  onClick?:    () => void
}

/** One row's cell outlines, in `pdfFigure`'s own box math (see `cellRect`). */
function RowOverlay ({ row, colour, highlighted, scale, pageHeight, cursor, onClick }: RowOverlayProps): React.ReactElement {
  return (
    <g onClick={onClick} style={{ cursor }}>
      {highlighted && row.cells.length > 0 && (
        <rect
          x={Math.min(...row.cells.map(cell => cell.x)) * scale}
          y={(pageHeight - row.top) * scale}
          width={(Math.max(...row.cells.map(cell => cell.x + cell.width)) - Math.min(...row.cells.map(cell => cell.x))) * scale}
          height={(row.top - row.bottom) * scale}
          fill={MATCH_FILL}
        />
      )}
      {row.cells.map(cell => (
        <rect
          key={`${String(cell.x)}:${String(cell.y)}`}
          x={cell.x * scale}
          y={(pageHeight - cell.y - cell.height) * scale}
          width={Math.max(cell.width, 1) * scale}
          height={cell.height * scale * CELL_HEIGHT_PAD}
          fill='transparent'
          stroke={colour}
          strokeWidth={1.5}
        />
      ))}
    </g>
  )
}

interface BandOverlayProps {
  band:       TablePreviewMatchView['bands'][number]
  scale:      number
  pageHeight: number
  onClick:    () => void
}

/** A column band's own strip, spanning the whole page height so it is easy to click regardless of which rows currently show data. */
function BandOverlay ({ band, scale, pageHeight, onClick }: BandOverlayProps): React.ReactElement {
  return (
    <rect
      x={band.start * scale}
      y={0}
      width={Math.max(band.end - band.start, 1) * scale}
      height={pageHeight * scale}
      fill='rgba(46, 134, 171, 0.08)'
      stroke='#2e86ab'
      strokeDasharray='4 2'
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <title>{band.name}</title>
    </rect>
  )
}

/**
 * Renders one page of `bytesUrl`'s PDF onto `canvas` with `pdf.js` (the
 * legacy build, browser side — `@opencraw/core`'s own dependency, per the
 * studio plan). Skips drawing (but does not throw) when the canvas has no
 * 2d context — a headless/test environment, where the overlay (built from
 * `pdf-view`'s geometry, not the bitmap) still works. `signal` aborts the
 * draw (the page changed or the pane unmounted) so the next render can use the canvas.
 */
async function renderPdfPage (canvas: HTMLCanvasElement, bytesUrl: string, pageNumber: number, scale: number, signal: AbortSignal): Promise<void> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
  const loadingTask = pdfjs.getDocument({ url: bytesUrl })
  const document = await loadingTask.promise
  try {
    const pdfPage = await document.getPage(pageNumber)
    if (signal.aborted) return
    const viewport = pdfPage.getViewport({ scale })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (context === null) return
    const task = pdfPage.render({ canvas, canvasContext: context, viewport })
    signal.addEventListener('abort', () => { task.cancel() }) // a canvas takes one render at a time: a superseded one must let go of it
    await task.promise
  } finally {
    await loadingTask.destroy()
  }
}
