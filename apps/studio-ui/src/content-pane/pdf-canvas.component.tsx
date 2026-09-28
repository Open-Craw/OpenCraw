import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Box, HStack, Select, Text, createListCollection } from '@chakra-ui/react'
import type { OutlineCard, PdfDocumentView, PdfRowView, TablePreviewMatchView } from '@opencraw/studio'
import { useTablePreviewQuery } from '../studio-client'
import { columnKeyFrom, escapedRowPattern, regexCardNode, tableCardNode } from './pdf-pick.mapper'
import type { TableDraft } from './pdf-pick.mapper'

/** What clicking (or dragging) on the PDF canvas is currently picking (studio plan §3.4, issue #94's 5b). */
export type PdfPickMode = 'header' | 'until' | 'column' | 'region'

export interface PdfCanvasProps {
  recipeId:     string
  /** The step path the snapshot (and this canvas's `table-preview` calls) are cached against. */
  stepPath:     string
  /** The document's cells and rows (`pdf-view`). */
  view:         PdfDocumentView
  /** Where `pdf.js` fetches the raw bytes to render (`GET /api/pdf-bytes`). */
  bytesUrl:     string
  /** Called with the `table` extract card every time a header/until/column pick changes it. */
  onTablePick:  (card: OutlineCard) => void
  /** Called with a `regex` extract card from a dragged region. */
  onRegionPick: (card: OutlineCard) => void
}

/** Rendering scale: PDF points -> canvas pixels (mirrors `capture.mjs`'s `pdfFigure`, whose scale is also 2 by default). */
const SCALE = 1.5
/** `pdfFigure`'s own cell-box padding: a cell is drawn a bit taller than its own font-size height. */
const CELL_HEIGHT_PAD = 1.2
const ROW_COLORS = ['#2e86ab', '#3bb273']
const HEADER_COLOR = '#e4572e'
const MATCH_FILL = 'rgba(59, 178, 115, 0.18)'

/**
 * The PDF canvas (studio plan §3.4, issue #94's 5b): the page `pdf.js`
 * renders, with every cell `readPdf` found outlined and each row in
 * alternating colours — porting `docs/how-it-works/capture/capture.mjs`'s
 * `pdfFigure` drawing math to React, over an SVG overlay (rather than a
 * second canvas) so row/column hit-testing is plain DOM event handling.
 *
 * Picking builds one `table` extract card incrementally: the header row's
 * click gives `selector`, the boundary ("last") row's click gives `until`,
 * a column band's click adds to `columns` — `onTablePick` fires the whole
 * card again each time, so the caller can upsert the one card in place
 * (mirrors the DOM picker's own "upgrade the last card" pattern). A dragged
 * region is a one-off `regex` pick instead (`onRegionPick`), never folded
 * into the table draft.
 *
 * The live preview (the current draft's matched rows, filled in as options
 * change) comes from `table-preview`, a pure, instant computation over the
 * already-cached document — no re-fetch per keystroke/click.
 */
export function PdfCanvas ({ recipeId, stepPath, view, bytesUrl, onTablePick, onRegionPick }: PdfCanvasProps): React.ReactElement {
  const [pageIndex, setPageIndex] = useState(0)
  const [mode, setMode] = useState<PdfPickMode>('header')
  const [draft, setDraft] = useState<TableDraft>({})
  const [drag, setDrag] = useState<{ startY: number, currentY: number } | undefined>(undefined)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const page = view.pages[pageIndex]
  const width = page === undefined ? 0 : Math.ceil(page.width * SCALE)
  const height = page === undefined ? 0 : Math.ceil(page.height * SCALE)

  const previewOptions = draft.header === undefined ? undefined : { header: draft.header, until: draft.until, columns: draft.columns }
  const preview = useTablePreviewQuery(recipeId, stepPath, previewOptions)
  const currentMatch = useMemo(
    () => preview.data?.matches.find(match => match.page === page?.number),
    [preview.data, page?.number],
  )

  useEffect(() => {
    if (draft.header === undefined) return
    onTablePick(tableCardNode(draft, stepPath))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onTablePick/stepPath identity churn should not re-fire the pick; only the draft's own content should.
  }, [draft])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || page === undefined) return
    let cancelled = false
    void renderPdfPage(canvas, bytesUrl, page.number, SCALE).catch((error: unknown) => {
      if (!cancelled) console.error('PDF canvas: could not render the page', error)
    })

    return () => { cancelled = true }
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

  function toPoints (pixelY: number): number {
    return page.height - pixelY / SCALE
  }

  function handlePointerDown (event: React.PointerEvent<SVGSVGElement>): void {
    if (mode !== 'region') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - bounds.top
    setDrag({ startY: y, currentY: y })
  }

  function handlePointerMove (event: React.PointerEvent<SVGSVGElement>): void {
    if (drag === undefined) return
    const bounds = event.currentTarget.getBoundingClientRect()
    setDrag({ ...drag, currentY: event.clientY - bounds.top })
  }

  function handlePointerUp (): void {
    if (drag === undefined) return
    const [fromY, toYPixel] = [Math.min(drag.startY, drag.currentY), Math.max(drag.startY, drag.currentY)]
    const [fromPoints, toPointsValue] = [toPoints(toYPixel), toPoints(fromY)]
    const covered = page.rows.filter(row => row.bottom <= toPointsValue && row.top >= fromPoints)
    setDrag(undefined)
    if (covered.length === 0) return
    onRegionPick(regexCardNode(covered.map(row => rowText(row)), stepPath))
  }

  return (
    <Box h='full' display='flex' flexDirection='column'>
      <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0} flexWrap='wrap'>
        {view.pages.length > 1 && <PageSelect pages={view.pages.length} value={pageIndex} onChange={setPageIndex} />}
        <ModeButton label='Header row' active={mode === 'header'} onClick={() => { setMode('header') }} />
        <ModeButton label='Last row (until)' active={mode === 'until'} onClick={() => { setMode('until') }} />
        <ModeButton label='Column' active={mode === 'column'} onClick={() => { setMode('column') }} />
        <ModeButton label='Drag a region' active={mode === 'region'} onClick={() => { setMode('region') }} />
        <Text fontSize='xs' color='fg.muted'>{`${String(page.rowCount)} rows, ${String(page.cellCount)} cells${page.hasTextLayer ? '' : ' — no text layer (a scan?)'}`}</Text>
        {draft.header !== undefined && <Badge size='sm' colorPalette='green'>{`table: ${draft.header}${draft.until === undefined ? '' : ` until ${draft.until}`}`}</Badge>}
        {preview.data?.error !== undefined && <Badge size='sm' colorPalette='orange'>{preview.data.error}</Badge>}
      </HStack>
      <Box flex='1' minH='0' overflow='auto' position='relative'>
        <Box position='relative' width={`${String(width)}px`} height={`${String(height)}px`}>
          <canvas ref={canvasRef} width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} />
          <svg
            width={width}
            height={height}
            style={{ position: 'absolute', top: 0, left: 0, cursor: mode === 'region' ? 'crosshair' : 'pointer' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {page.rows.map((row, index) => (
              <RowOverlay
                key={`${String(row.top)}:${String(row.bottom)}`}
                row={row}
                colour={row.cells[0]?.text !== undefined && currentMatch?.headerRowIndex === index ? HEADER_COLOR : ROW_COLORS[index % 2]}
                highlighted={currentMatch?.matchedRowIndices.includes(index) ?? false}
                scale={SCALE}
                pageHeight={page.height}
                onClick={() => { pickHeaderOrUntil(row) }}
              />
            ))}
            {mode === 'column' && currentMatch !== undefined && currentMatch.bands.map(band => (
              <BandOverlay key={band.column} band={band} scale={SCALE} pageHeight={page.height} onClick={() => { pickColumn(band.name) }} />
            ))}
            {drag !== undefined && (
              <rect
                x={0}
                y={Math.min(drag.startY, drag.currentY)}
                width={width}
                height={Math.abs(drag.currentY - drag.startY)}
                fill='rgba(155, 93, 229, 0.2)'
                stroke='#9b5de5'
              />
            )}
          </svg>
        </Box>
      </Box>
    </Box>
  )
}

function rowText (row: PdfRowView): string {
  return row.cells.map(cell => cell.text).join('\t')
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
  onClick:     () => void
}

/** One row's cell outlines, in `pdfFigure`'s own box math: `left = x * scale`, `top = (pageHeight - y - height) * scale`, a cell drawn `height * scale * 1.2` tall. */
function RowOverlay ({ row, colour, highlighted, scale, pageHeight, onClick }: RowOverlayProps): React.ReactElement {
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
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
 * `pdf-view`'s geometry, not the bitmap) still works.
 */
async function renderPdfPage (canvas: HTMLCanvasElement, bytesUrl: string, pageNumber: number, scale: number): Promise<void> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
  const loadingTask = pdfjs.getDocument({ url: bytesUrl })
  const document = await loadingTask.promise
  try {
    const pdfPage = await document.getPage(pageNumber)
    const viewport = pdfPage.getViewport({ scale })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (context === null) return
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
  } finally {
    await loadingTask.destroy()
  }
}
