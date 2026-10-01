import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { OutlineCard, WorkbookDocumentView } from '@opencraw/studio'
import { CARD_DRAG_MIME } from '../steps-outline'
import { createStudioQueryClient } from '../studio-client'
import { GridCanvas } from './grid-canvas.component'

// jsdom reports a zero-size scroll container, so the real virtualizer mounts no row (see content-pane.component.test.tsx); every row is "visible" here instead.
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize:    () => count * 24,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 24, size: 24 })),
  }),
}))

const text = (value: string) => ({ value, type: 'string' as const })
const VIEW: WorkbookDocumentView = {
  sheets: [{
    name:        'listino',
    hidden:      false,
    hiddenRows:  [],
    columnCount: 3,
    merges:      [],
    rows:        [
      [text('Listino prezzi settembre 2026'), text(''), text('')],
      [text('Marca'), text('Modello'), text('Prezzo')],
      [text('Fiat'), text('Pandina'), { value: 15_950, type: 'number' as const }],
    ],
  }],
}

interface HighlightProps {
  steps?:         { id: string, kind: string, selector: string }[]
  hoveredStepId?: string
  onHoverStepId?: (stepId: string | undefined) => void
}

function renderCanvas (onCellPick: (card: OutlineCard) => void = () => {}, highlight: HighlightProps = {}) {
  Object.defineProperty(globalThis, 'fetch', { value: jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ matches: [] }) }), configurable: true })

  return render(
    <QueryClientProvider client={createStudioQueryClient()}>
      <ChakraProvider value={defaultSystem}>
        <GridCanvas recipeId='listino' stepPath='start' view={VIEW} onTablePick={() => {}} onCellPick={onCellPick} onCsvOverrideChange={() => {}} {...highlight} />
      </ChakraProvider>
    </QueryClientProvider>,
  )
}

function click (target: Element, shiftKey = false): void {
  fireEvent.mouseDown(target, { button: 0, shiftKey })
  fireEvent.mouseUp(target, { button: 0, shiftKey })
}

beforeAll(() => {
  history.replaceState({}, '', '/?token=abc123')
})

describe('GridCanvas cell mode (issue #123)', () => {
  it('starts in Cell mode and lights up the cell under the mouse, clearing when the mouse leaves the grid', () => {
    renderCanvas()
    fireEvent.mouseEnter(screen.getByText('Pandina'))
    expect(screen.getByTestId('snap-target').textContent).toBe('Pandina')
    fireEvent.mouseLeave(screen.getByTestId('snap-target').parentElement?.parentElement as Element)
    expect(screen.queryByTestId('snap-target')).toBeNull()
  })

  it('a click stages the cell: the chip shows its value, and "Add to recipe" hands over a jsonpath card named after it', () => {
    const onCellPick = jest.fn()
    renderCanvas(onCellPick)

    click(screen.getByText('Listino prezzi settembre 2026'))

    expect(screen.getAllByTestId('staged-cell')).toHaveLength(1)
    expect(screen.getByTestId('region-chip').textContent).toContain('Listino prezzi settembre 2026')
    // A real click is a press and a release first — and a release over the grid's background would drop the selection before the click lands.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Add to recipe' }), { button: 0 })
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Add to recipe' }), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Add to recipe' }))
    expect(onCellPick).toHaveBeenCalledTimes(1)
    const [card] = onCellPick.mock.calls[0] as [OutlineCard]
    expect(card.step).toEqual({ type: 'extract', id: 'listinoPrezziSettembre2026', kind: 'jsonpath', selector: "$.sheets[?(@.name=='listino')].rows[0][0]", take: 'json' })
    expect(screen.queryByTestId('region-chip')).toBeNull()
  })

  it('shift+click, or pressing on one cell and releasing on another, stages the rectangle between them as a list', () => {
    const onCellPick = jest.fn()
    renderCanvas(onCellPick)

    click(screen.getByText('Marca'))
    click(screen.getByText('Pandina'), true)
    expect(screen.getAllByTestId('staged-cell')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Add to recipe' }))
    expect((onCellPick.mock.calls[0] as [OutlineCard])[0].step).toMatchObject({ kind: 'jsonpath', selector: "$.sheets[?(@.name=='listino')].rows[1:3][0:2]", many: true })

    fireEvent.mouseDown(screen.getByText('Modello'), { button: 0 })
    fireEvent.mouseUp(screen.getByText('15950'), { button: 0 })
    expect(screen.getAllByTestId('staged-cell')).toHaveLength(4)
    expect(screen.getByTestId('region-chip').textContent).toContain('Modello Prezzo')
  })

  it('the chip can be dragged, carrying the same card for the Steps tab to drop', () => {
    renderCanvas()
    click(screen.getByText('Fiat'))
    const setData = jest.fn()

    fireEvent.dragStart(screen.getByTestId('region-chip'), { dataTransfer: { setData, effectAllowed: 'none' } })

    const payload = setData.mock.calls.find(([type]) => type === CARD_DRAG_MIME)?.[1] as string
    expect(JSON.parse(payload)).toMatchObject({ kind: 'card', step: { kind: 'jsonpath', selector: "$.sheets[?(@.name=='listino')].rows[2][0]" } })
  })

  it('clearing the selection, or releasing on the empty grid, drops the chip; nothing is written meanwhile', () => {
    const onCellPick = jest.fn()
    renderCanvas(onCellPick)
    click(screen.getByText('Fiat'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByTestId('region-chip')).toBeNull()

    click(screen.getByText('Fiat'))
    const [stagedCell] = screen.getAllByTestId('staged-cell') // the chip now shows "Fiat" too, so the cell is found by its own mark
    fireEvent.mouseUp(stagedCell.parentElement?.parentElement as Element, { button: 0 })
    expect(screen.queryByTestId('region-chip')).toBeNull()
    expect(onCellPick).not.toHaveBeenCalled()
  })

  it('the table modes still pick a header row by clicking a cell', () => {
    renderCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Header row(s)' }))
    fireEvent.click(screen.getByText('Marca'))
    expect(screen.getByText(/^table: /)).toBeTruthy()
    expect(screen.queryByTestId('region-chip')).toBeNull()
  })

  it('outlines the cells steps already read, fills the hovered step\'s in, and reports the step a hovered cell belongs to (issue #125)', () => {
    const onHoverStepId = jest.fn()
    const steps = [{ id: 'brand', kind: 'jsonpath', selector: "$.sheets[?(@.name=='listino')].rows[2][0]" }, { id: 'header', kind: 'jsonpath', selector: "$.sheets[?(@.name=='listino')].rows[1][0:3]" }]
    renderCanvas(() => {}, { steps, hoveredStepId: 'header', onHoverStepId })
    const marked = screen.getAllByTestId('grid-cell').filter(cell => Boolean(cell.dataset.stepIds))
    expect(marked.map(cell => cell.dataset.stepIds)).toEqual(['header', 'header', 'header', 'brand'])
    expect(marked.filter(cell => cell.dataset.highlighted === 'true')).toHaveLength(3)

    fireEvent.mouseEnter(screen.getByText('Fiat'))
    expect(onHoverStepId).toHaveBeenLastCalledWith('brand')
    fireEvent.mouseEnter(screen.getByText('Pandina'))
    expect(onHoverStepId).toHaveBeenLastCalledWith(undefined)
  })
})
