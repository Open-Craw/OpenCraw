import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Badge, Box, HStack, Input, Table, Text } from '@chakra-ui/react'
import type { GridSheetView, OutlineCard, WorkbookDocumentView } from '@opencraw/studio'
import type { GridViewOverride } from '../studio-client'
import { useGridPreviewQuery } from '../studio-client'
import { columnHeaderText, columnKeyFrom, escapedRowPattern, fillDownKeyFor, filledGridOf, gridTableCardNode, rowPickText, sheetPattern } from './grid-pick.mapper'
import type { GridDraft } from './grid-pick.mapper'

/** What clicking on the grid canvas is currently picking (studio plan §3.4, issue #94's 5c). */
export type GridPickMode = 'sheet' | 'header' | 'until' | 'column' | 'fillDown'

export interface GridCanvasProps {
  recipeId:            string
  /** The step path the snapshot (and this canvas's `grid-preview` calls) are cached against. */
  stepPath:            string
  /** The document's sheets and cells (`grid-view`). */
  view:                WorkbookDocumentView
  /** Called with the `table` extract card every time a sheet/header/until/column/fillDown pick changes it. */
  onTablePick:         (card: OutlineCard) => void
  /** The CSV delimiter/encoding override currently applied, if any (undefined: auto-detected). Not a CSV: undefined and unused. */
  csvOverride?:        GridViewOverride
  onCsvOverrideChange: (override: GridViewOverride) => void
}

const ROW_HEIGHT = 24
const CELL_WIDTH = 130
const OVERSCAN = 30
const PREVIEW_ROW_LIMIT = 5

/**
 * The grid canvas (studio plan §3.4, issue #94's 5c): the engine's own
 * workbook model — sheet tabs (hidden sheets marked), hidden rows marked,
 * merged cells drawn as one, typed cells shown with their type — virtualised
 * with `@tanstack/react-virtual` (reused from phase 4's Inspect panel DOM
 * tree, `dom-tree-view.component.tsx`, per the issue's own instruction not
 * to add a second virtualisation library).
 *
 * Picking builds one `table` extract card incrementally, the same way the
 * PDF canvas's header/until/column picks do (`pdf-canvas.component.tsx`):
 * a sheet tab's pick gives `sheet`, the header row(s)' pick gives
 * `header`/`headerRows`, the first non-data row's pick gives `until`, a
 * column's pick adds to `columns`, a merged group's label pick adds to
 * `fillDown` — `onTablePick` fires the whole card again each time, so the
 * caller can upsert the one card in place.
 *
 * A merged cell that starts above the virtualised window but whose covered
 * rows are still on screen draws as a gap rather than a tall cell — an
 * accepted tradeoff of row-by-row virtualisation (the same "not attempted
 * here" honesty `page-snapshot`'s own doc comments use elsewhere); a large
 * `overscan` keeps this from being visible in practice for any sheet a
 * person is actually scrolling through by hand.
 */
export function GridCanvas ({ recipeId, stepPath, view, onTablePick, csvOverride, onCsvOverrideChange }: GridCanvasProps): React.ReactElement {
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mode, setMode] = useState<GridPickMode>('header')
  const [draft, setDraft] = useState<GridDraft>({})
  const parentRef = useRef<HTMLDivElement>(null)

  const sheet = view.sheets[sheetIndex]
  const filledGrid = useMemo(() => (sheet === undefined ? [] : filledGridOf(sheet)), [sheet])
  const layout = useMemo(() => (sheet === undefined ? [] : sheetGridLayout(sheet)), [sheet])
  const headerRowIndexes = draft.headerRowIndex === undefined ? undefined : Array.from({ length: draft.headerRows ?? 1 }, (_, index) => (draft.headerRowIndex as number) + index)

  const previewOptions = draft.header === undefined
    ? undefined
    : { sheet: draft.sheet, header: draft.header, until: draft.until, columns: draft.columns, headerRows: draft.headerRows, fillDown: draft.fillDown, includeHidden: draft.includeHidden }
  const preview = useGridPreviewQuery(recipeId, stepPath, previewOptions)
  const currentMatch = useMemo(() => preview.data?.matches.find(match => match.sheet === sheet?.name), [preview.data, sheet?.name])

  const virtualizer = useVirtualizer({
    count:            sheet?.rows.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize:     () => ROW_HEIGHT,
    overscan:         OVERSCAN,
  })

  useEffect(() => {
    if (draft.header === undefined) return
    onTablePick(gridTableCardNode(draft, stepPath))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onTablePick/stepPath identity churn should not re-fire the pick; only the draft's own content should (mirrors pdf-canvas.component.tsx's own table-draft effect).
  }, [draft])

  if (sheet === undefined) {
    return <Box p={4} color='fg.muted'><Text>This workbook has no sheets.</Text></Box>
  }

  function pickSheetTab (index: number): void {
    setSheetIndex(index)
    if (mode !== 'sheet') return
    const name = view.sheets[index].name
    setDraft(previous => ({ ...previous, sheet: sheetPattern(name) }))
  }

  function pickHeaderRow (rowIndex: number): void {
    const text = rowPickText(sheet.rows[rowIndex])
    if (text === '') return
    setDraft((previous) => {
      if (previous.headerRowIndex !== undefined && rowIndex === previous.headerRowIndex + (previous.headerRows ?? 1)) {
        return { ...previous, headerRows: (previous.headerRows ?? 1) + 1 }
      }

      return { sheet: previous.sheet, includeHidden: previous.includeHidden, header: escapedRowPattern(text), headerRowIndex: rowIndex, headerRows: 1 }
    })
  }

  function pickUntilRow (rowIndex: number): void {
    if (draft.header === undefined) return
    const text = rowPickText(sheet.rows[rowIndex])
    if (text === '') return
    setDraft(previous => ({ ...previous, until: escapedRowPattern(text) }))
  }

  function pickColumn (columnIndex: number): void {
    if (headerRowIndexes === undefined) return
    const text = columnHeaderText(filledGrid, headerRowIndexes, columnIndex)
    if (text === '') return
    const key = columnKeyFrom(text)
    setDraft(previous => ({ ...previous, columns: { ...previous.columns, [key]: escapedRowPattern(text) } }))
  }

  function pickFillDown (columnIndex: number): void {
    if (headerRowIndexes === undefined) return
    const text = columnHeaderText(filledGrid, headerRowIndexes, columnIndex)
    if (text === '') return
    const key = fillDownKeyFor(draft, text)
    setDraft((previous) => {
      const existing = previous.fillDown ?? []
      if (existing.includes(key)) return previous

      return { ...previous, fillDown: [...existing, key] }
    })
  }

  function handleCellClick (rowIndex: number, columnIndex: number, isMergeLabel: boolean): void {
    if (mode === 'header') {
      pickHeaderRow(rowIndex)

      return
    }
    if (mode === 'until') {
      pickUntilRow(rowIndex)

      return
    }
    if (mode === 'column') {
      pickColumn(columnIndex)

      return
    }
    if (mode === 'fillDown' && isMergeLabel) pickFillDown(columnIndex)
  }

  return (
    <Box h='full' display='flex' flexDirection='column'>
      <HStack px={3} py={2} borderBottomWidth='1px' gap={1} flexShrink={0} flexWrap='wrap'>
        {view.sheets.map((candidate, index) => (
          <SheetTab key={candidate.name} sheet={candidate} active={index === sheetIndex} onClick={() => { pickSheetTab(index) }} />
        ))}
      </HStack>
      <HStack px={3} py={2} borderBottomWidth='1px' gap={3} flexShrink={0} flexWrap='wrap'>
        <ModeButton label='Sheet' active={mode === 'sheet'} onClick={() => { setMode('sheet') }} />
        <ModeButton label='Header row(s)' active={mode === 'header'} onClick={() => { setMode('header') }} />
        <ModeButton label='First non-data row (until)' active={mode === 'until'} onClick={() => { setMode('until') }} />
        <ModeButton label='Column' active={mode === 'column'} onClick={() => { setMode('column') }} />
        <ModeButton label='Fill down' active={mode === 'fillDown'} onClick={() => { setMode('fillDown') }} />
        {view.csv !== undefined && (
          <CsvFormatControls format={view.csv} override={csvOverride} onChange={onCsvOverrideChange} />
        )}
        {draft.header !== undefined && <Badge size='sm' colorPalette='green'>{`table: ${draft.header}${draft.until === undefined ? '' : ` until ${draft.until}`}`}</Badge>}
        {preview.data?.error !== undefined && <Badge size='sm' colorPalette='orange'>{preview.data.error}</Badge>}
      </HStack>
      <Box flex='1' minH='0' display='flex' flexDirection='column'>
        <Box ref={parentRef} flex='1' minH='0' overflow='auto' position='relative'>
          <Box h={`${String(virtualizer.getTotalSize())}px`} position='relative' style={{ width: `${String(sheet.columnCount * CELL_WIDTH)}px` }}>
            {virtualizer.getVirtualItems().map(item => (
              layout[item.index]?.map(cell => cell === undefined
                ? null
                : (
                    <GridCellBox
                      key={`${String(item.index)}:${String(cell.columnIndex)}`}
                      cell={cell}
                      top={item.start}
                      isHeader={headerRowIndexes?.includes(item.index) ?? false}
                      isHidden={sheet.hiddenRows.includes(item.index)}
                      onClick={() => { handleCellClick(item.index, cell.columnIndex, cell.isMergeLabel) }}
                    />
                  ))
            ))}
          </Box>
        </Box>
        {currentMatch !== undefined && <GridPreviewPanel match={currentMatch} />}
      </Box>
    </Box>
  )
}

interface RenderCell {
  columnIndex:  number
  rowSpan:      number
  colSpan:      number
  value:        string | number | boolean
  type:         'string' | 'number' | 'boolean' | 'date'
  isMergeLabel: boolean
}

/**
 * Every sheet row's own cells to render — a merge's covered cells (every
 * cell but its top-left) are left out; its top-left cell carries the
 * `rowSpan`/`colSpan` to draw it as one. `isMergeLabel` marks a merge that
 * spans more than one row in exactly one column: a repeated group's own
 * label, the merged-group pick target `fillDown` reads (issue #94's 5c).
 */
function sheetGridLayout (sheet: GridSheetView): (RenderCell | undefined)[][] {
  const covered = coveredCells(sheet.merges)
  const spanAt = new Map(sheet.merges.map(merge => [`${String(merge.top)}:${String(merge.left)}`, { rowSpan: merge.bottom - merge.top + 1, colSpan: merge.right - merge.left + 1 }]))

  return sheet.rows.map((row, rowIndex) => row.map((cell, columnIndex) => {
    const key = `${String(rowIndex)}:${String(columnIndex)}`
    if (covered.has(key)) return
    const span = spanAt.get(key)

    return { columnIndex, rowSpan: span?.rowSpan ?? 1, colSpan: span?.colSpan ?? 1, value: cell.value, type: cell.type, isMergeLabel: span !== undefined && span.rowSpan > 1 && span.colSpan === 1 }
  }))
}

/** Every cell covered by a merge, its own top-left cell excluded (that one still renders, spanned). */
function coveredCells (merges: readonly GridSheetView['merges'][number][]): Set<string> {
  const covered = new Set<string>()
  for (const merge of merges) {
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      for (let column = merge.left; column <= merge.right; column += 1) {
        if (row !== merge.top || column !== merge.left) covered.add(`${String(row)}:${String(column)}`)
      }
    }
  }

  return covered
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

function SheetTab ({ sheet, active, onClick }: { sheet: GridSheetView, active: boolean, onClick: () => void }): React.ReactElement {
  return (
    <HStack
      as='button'
      gap={1}
      px={2}
      py={1}
      borderRadius='sm'
      bg={active ? 'bg.emphasized' : undefined}
      opacity={sheet.hidden ? 0.55 : 1}
      onClick={onClick}
    >
      <Text fontSize='sm' fontWeight={active ? 'semibold' : 'normal'}>{sheet.name}</Text>
      {sheet.hidden && <Badge size='xs' colorPalette='gray'>hidden</Badge>}
    </HStack>
  )
}

const TYPE_COLOR: Record<RenderCell['type'], string> = {
  string:  'fg',
  number:  'orange.fg',
  boolean: 'blue.fg',
  date:    'purple.fg',
}

interface GridCellBoxProps {
  cell:     RenderCell
  top:      number
  isHeader: boolean
  isHidden: boolean
  onClick:  () => void
}

function GridCellBox ({ cell, top, isHeader, isHidden, onClick }: GridCellBoxProps): React.ReactElement {
  return (
    <Box
      position='absolute'
      style={{ top: `${String(top)}px`, left: `${String(cell.columnIndex * CELL_WIDTH)}px`, width: `${String(cell.colSpan * CELL_WIDTH)}px`, height: `${String(cell.rowSpan * ROW_HEIGHT)}px` }}
      borderWidth='1px'
      borderColor='border.muted'
      bg={isHeader ? 'yellow.subtle' : (cell.isMergeLabel ? 'purple.subtle' : 'bg')}
      opacity={isHidden ? 0.4 : 1}
      overflow='hidden'
      px={1}
      fontSize='xs'
      color={TYPE_COLOR[cell.type]}
      cursor='pointer'
      _hover={{ bg: 'bg.emphasized' }}
      onClick={onClick}
      title={isHidden ? 'Hidden row' : undefined}
      truncate
    >
      {String(cell.value)}
    </Box>
  )
}

function GridPreviewPanel ({ match }: { match: { title: string, header: string[], rows: Record<string, string | number | boolean>[] } }): React.ReactElement {
  const rows = match.rows.slice(0, PREVIEW_ROW_LIMIT)

  return (
    <Box borderTopWidth='1px' maxH='160px' overflow='auto' flexShrink={0}>
      <HStack px={2} py={1} gap={2}>
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

function CsvFormatControls ({ format, override, onChange }: { format: { delimiter: string, encoding: string }, override: GridViewOverride | undefined, onChange: (override: GridViewOverride) => void }): React.ReactElement {
  const delimiter = override?.delimiter ?? format.delimiter
  const encoding = override?.encoding ?? format.encoding

  return (
    <HStack gap={2}>
      <Text fontSize='xs' color='fg.muted'>Delimiter</Text>
      <Input
        size='xs'
        width='40px'
        defaultValue={delimiter}
        key={delimiter}
        onBlur={(event) => { const value = event.target.value; if (value !== '' && value !== delimiter) onChange({ delimiter: value, encoding: override?.encoding }) }}
      />
      <Text fontSize='xs' color='fg.muted'>Encoding</Text>
      <Input
        size='xs'
        width='110px'
        defaultValue={encoding}
        key={encoding}
        onBlur={(event) => { const value = event.target.value; if (value !== '' && value !== encoding) onChange({ delimiter: override?.delimiter, encoding: value }) }}
      />
    </HStack>
  )
}
