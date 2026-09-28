import { useEffect, useMemo, useState } from 'react'
import { Badge, Box, HStack, Select, Table, Text, VStack, createListCollection } from '@chakra-ui/react'
import type { DeckDocumentView, DeckSlideView, GridSheetView, OutlineCard } from '@opencraw/studio'
import { useDeckPreviewQuery } from '../studio-client'
import { columnHeaderText, columnKeyFrom, deckChartCardNode, deckTableCardNode, escapedRowPattern, fillDownKeyFor, filledGridOf, rowPickText, slidePattern } from './deck-pick.mapper'
import type { DeckDraft } from './deck-pick.mapper'

/** What clicking on the deck canvas is currently picking (studio plan §3.4, issue #94's 5d). "fillDown" only applies to a native table (a merged-cell group); a text-box grid has none. */
export type DeckPickMode = 'header' | 'until' | 'column' | 'fillDown'
/** Which kind of table the current picks build: a slide's native table, or its text boxes laid out as a grid. */
export type DeckSource = 'table' | 'shapes'

export interface DeckCanvasProps {
  recipeId:    string
  /** The step path the snapshot (and this canvas's `deck-preview` calls) are cached against. */
  stepPath:    string
  /** The document's slides (`deck-view`). */
  view:        DeckDocumentView
  /** Called with the `table` extract card every time a slide/header/until/column/fillDown/shapes pick changes it. */
  onTablePick: (card: OutlineCard) => void
  /** Called with the `jsonpath` extract card the moment a chart is picked (issue #94's 5d: a chart pick is a single click, not a multi-step draft). */
  onChartPick: (card: OutlineCard) => void
}

const PREVIEW_ROW_LIMIT = 5

/**
 * The deck canvas (studio plan §3.4, issue #94's 5d): every slide redrawn
 * from its shapes' own boxes (absolutely positioned, no bitmap rendering —
 * a deck's shapes are already just boxes with text, unlike a PDF page), with
 * a side list of its native tables, charts and notes.
 *
 * Picking builds one `table` extract card incrementally, the same
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
 */
export function DeckCanvas ({ recipeId, stepPath, view, onTablePick, onChartPick }: DeckCanvasProps): React.ReactElement {
  const [slideIndex, setSlideIndex] = useState(0)
  const [source, setSource] = useState<DeckSource>('table')
  const [tableIndex, setTableIndex] = useState(0)
  const [mode, setMode] = useState<DeckPickMode>('header')
  const [draft, setDraft] = useState<DeckDraft>({})

  const slide = view.slides[slideIndex]
  const activeTable: GridSheetView | undefined = source === 'table' ? slide?.tables[tableIndex] : undefined
  const headerRowIndexes = draft.headerRowIndex === undefined ? undefined : Array.from({ length: draft.headerRows ?? 1 }, (_, index) => (draft.headerRowIndex as number) + index)

  const previewOptions = draft.header === undefined
    ? undefined
    : { slide: draft.slide, shapes: draft.shapes, header: draft.header, until: draft.until, columns: draft.columns, headerRows: draft.headerRows, fillDown: draft.fillDown, includeHidden: draft.includeHidden }
  const preview = useDeckPreviewQuery(recipeId, stepPath, previewOptions)
  const currentMatch = useMemo(() => preview.data?.matches.find(match => match.slide === slide?.number), [preview.data, slide?.number])

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

  return (
    <Box h='full' display='flex' flexDirection='column'>
      <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0} flexWrap='wrap'>
        {view.slides.length > 1 && <SlideSelect slides={view.slides} value={slideIndex} onChange={setSlideIndex} />}
        <ModeButton label='Native table' active={source === 'table'} onClick={() => { switchSource('table') }} />
        <ModeButton label='Text-box grid' active={source === 'shapes'} onClick={() => { switchSource('shapes') }} />
        <ModeButton label='Header row(s)' active={mode === 'header'} onClick={() => { setMode('header') }} />
        <ModeButton label='Last row (until)' active={mode === 'until'} onClick={() => { setMode('until') }} />
        <ModeButton label='Column' active={mode === 'column'} onClick={() => { setMode('column') }} />
        {source === 'table' && <ModeButton label='Fill down' active={mode === 'fillDown'} onClick={() => { setMode('fillDown') }} />}
        {draft.header !== undefined && <Badge size='sm' colorPalette='green'>{`table: ${draft.header}${draft.until === undefined ? '' : ` until ${draft.until}`}`}</Badge>}
        {preview.data?.error !== undefined && <Badge size='sm' colorPalette='orange'>{preview.data.error}</Badge>}
      </HStack>
      <Box flex='1' minH='0' display='flex' overflow='hidden'>
        <Box flex='2' minW='0' overflow='auto' p={3}>
          {source === 'shapes' && (
            <SlideCanvas slide={slide} width={view.width} height={view.height} headerRowIndex={draft.headerRowIndex} onPick={pickShape} />
          )}
          {source === 'table' && activeTable !== undefined && (
            <NativeTableGrid table={activeTable} headerRowIndexes={headerRowIndexes} mode={mode} onRowPick={pickTableRow} onCellPick={pickTableCell} />
          )}
          {source === 'table' && activeTable === undefined && (
            <Text color='fg.muted' fontSize='sm'>This slide has no native tables.</Text>
          )}
          {currentMatch !== undefined && <DeckPreviewPanel match={currentMatch} />}
        </Box>
        <Box flex='1' minW='220px' maxW='320px' borderLeftWidth='1px' overflow='auto' p={3}>
          <SidePanel slide={slide} activeSource={source} activeTableIndex={tableIndex} onTablePick={pickTable} onChartPick={pickChart} />
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
  onPick:          (shapeIndex: number) => void
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
          cursor='pointer'
          _hover={{ bg: 'bg.emphasized' }}
          onClick={() => { onPick(index) }}
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
}

/** The slide's native tables, charts and notes, listed beside the canvas (studio plan §3.4, issue #94's 5d). */
function SidePanel ({ slide, activeSource, activeTableIndex, onTablePick, onChartPick }: SidePanelProps): React.ReactElement {
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
            <Box key={index} as='button' textAlign='left' p={2} borderWidth='1px' borderRadius='sm' onClick={() => { onChartPick(index) }}>
              <Text fontSize='xs' fontWeight='medium'>{chart.title ?? chart.type}</Text>
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
