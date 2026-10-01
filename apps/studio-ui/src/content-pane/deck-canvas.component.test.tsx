import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { DeckDocumentView, OutlineCard } from '@opencraw/studio'
import { CARD_DRAG_MIME } from '../steps-outline'
import { createStudioQueryClient } from '../studio-client'
import { DeckCanvas } from './deck-canvas.component'

const TITLE = { x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }
const SOURCE = { x: 60, y: 120, width: 840, height: 300, text: 'Fonte: UNRAE' }
const VIEW: DeckDocumentView = {
  width:  960,
  height: 540,
  slides: [{ number: 1, title: 'Incentivi giugno', hidden: false, shapes: [TITLE, SOURCE], shapeRows: [[0], [1]], tables: [], charts: [], notes: '' }],
}

interface SentCommand { type: string, selector?: string }

/** Answers `region-preview` as the engine would for these two text boxes: whichever of them sit inside the selector's box. */
function mockFetch (): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(init.body as string) as SentCommand
    if (command.type !== 'region-preview') return { ok: true, status: 200, json: async () => ({ matches: [] }) }
    const match = /y=(-?\d+)\.\.(-?\d+)/.exec(command.selector ?? '')
    const [y1, y2] = match === null ? [0, 0] : [Number(match[1]), Number(match[2])]
    const shapes = [TITLE, SOURCE].filter(shape => shape.y >= y1 && shape.y + shape.height <= y2)

    return { ok: true, status: 200, json: async () => ({ matches: shapes.length === 0 ? [] : [{ page: 1, text: shapes.map(shape => shape.text).join('\n'), cells: [], shapes }] }) }
  })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function sentSelectors (fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as SentCommand).filter(command => command.type === 'region-preview').map(command => command.selector ?? '')
}

function renderCanvas (onRegionPick: (card: OutlineCard) => void = () => {}) {
  return render(
    <QueryClientProvider client={createStudioQueryClient()}>
      <ChakraProvider value={defaultSystem}>
        <DeckCanvas recipeId='incentivi' stepPath='start' view={VIEW} onTablePick={() => {}} onChartPick={() => {}} onRegionPick={onRegionPick} />
      </ChakraProvider>
    </QueryClientProvider>,
  )
}

/** The slide is drawn at a point per pixel from the overlay's own corner (jsdom's bounds sit at 0,0): the title spans 60..900 × 30..90, the source line 60..900 × 120..420. */
const ON_TITLE = { clientX: 100, clientY: 50 }
const ON_SOURCE = { clientX: 100, clientY: 200 }
const ON_NOTHING = { clientX: 950, clientY: 530 }

function click (target: Element, at: { clientX: number, clientY: number }, shiftKey = false): void {
  fireEvent.mouseDown(target, { ...at, button: 0, shiftKey })
  fireEvent.mouseUp(target, { ...at, button: 0, shiftKey })
}

beforeAll(() => {
  history.replaceState({}, '', '/?token=abc123')
})

describe('DeckCanvas text mode (issue #122)', () => {
  it('starts in Text mode and snaps to the text box under the mouse, clearing when the mouse leaves', () => {
    mockFetch()
    renderCanvas()
    const overlay = screen.getByTestId('deck-overlay')

    fireEvent.mouseMove(overlay, ON_TITLE)
    expect(screen.getByTestId('snap-target')).toBeTruthy()
    fireEvent.mouseMove(overlay, ON_NOTHING)
    expect(screen.queryByTestId('snap-target')).toBeNull()
    fireEvent.mouseMove(overlay, ON_TITLE)
    fireEvent.mouseLeave(overlay)
    expect(screen.queryByTestId('snap-target')).toBeNull()
  })

  it('a click stages the snapped text box: its slide= box goes to region-preview, and the chip shows the engine\'s own text', async () => {
    const fetchMock = mockFetch()
    renderCanvas()

    click(screen.getByTestId('deck-overlay'), ON_TITLE)

    expect(screen.getByTestId('staged-region')).toBeTruthy()
    await waitFor(() => { expect(screen.getByTestId('region-chip').textContent).toContain(TITLE.text) })
    expect(sentSelectors(fetchMock)).toEqual(['slide=1 x=59..901 y=29..91'])
    expect(screen.getAllByTestId('staged-shape')).toHaveLength(1)
  })

  it('"Add to recipe" hands over a region card named after the text, and clears the selection', async () => {
    mockFetch()
    const onRegionPick = jest.fn()
    renderCanvas(onRegionPick)
    click(screen.getByTestId('deck-overlay'), ON_SOURCE)
    await waitFor(() => { expect(screen.getByTestId('region-chip').textContent).toContain(SOURCE.text) })

    fireEvent.click(screen.getByRole('button', { name: 'Add to recipe' }))

    expect(onRegionPick).toHaveBeenCalledTimes(1)
    const [card] = onRegionPick.mock.calls[0] as [OutlineCard]
    expect(card.step).toEqual({ type: 'extract', id: 'fonteUnrae', kind: 'region', selector: 'slide=1 x=59..901 y=119..421' })
    expect(screen.queryByTestId('region-chip')).toBeNull()
  })

  it('shift+click extends the selection to a second text box: one box around both, both texts', async () => {
    const fetchMock = mockFetch()
    renderCanvas()
    const overlay = screen.getByTestId('deck-overlay')

    click(overlay, ON_TITLE)
    click(overlay, ON_SOURCE, true)

    await waitFor(() => { expect(sentSelectors(fetchMock)).toContain('slide=1 x=59..901 y=29..421') })
    await waitFor(() => { expect(screen.getAllByTestId('staged-shape')).toHaveLength(2) })
  })

  it('a drag stages the box drawn, in the slide\'s own points (y down), instead of snapping', async () => {
    const fetchMock = mockFetch()
    renderCanvas()
    const overlay = screen.getByTestId('deck-overlay')

    fireEvent.mouseDown(overlay, { clientX: 50, clientY: 20, button: 0 })
    fireEvent.mouseMove(overlay, { clientX: 920, clientY: 430 })
    fireEvent.mouseUp(overlay, { clientX: 920, clientY: 430, button: 0 })

    await waitFor(() => { expect(sentSelectors(fetchMock)).toEqual(['slide=1 x=50..920 y=20..430']) })
    await waitFor(() => { expect(screen.getAllByTestId('staged-shape')).toHaveLength(2) })
  })

  it('the chip can be dragged, carrying the same region card for the Steps tab to drop', async () => {
    mockFetch()
    renderCanvas()
    click(screen.getByTestId('deck-overlay'), ON_TITLE)
    await waitFor(() => { expect(screen.getByTestId('region-chip').textContent).toContain(TITLE.text) })
    const setData = jest.fn()

    fireEvent.dragStart(screen.getByTestId('region-chip'), { dataTransfer: { setData, effectAllowed: 'none' } })

    const payload = setData.mock.calls.find(([type]) => type === CARD_DRAG_MIME)?.[1] as string
    expect(JSON.parse(payload)).toMatchObject({ kind: 'card', step: { kind: 'region', selector: 'slide=1 x=59..901 y=29..91' } })
  })

  it('clearing the selection, or clicking empty slide, drops the chip; nothing is written meanwhile', async () => {
    mockFetch()
    const onRegionPick = jest.fn()
    renderCanvas(onRegionPick)
    const overlay = screen.getByTestId('deck-overlay')
    click(overlay, ON_TITLE)
    await waitFor(() => { expect(screen.getByTestId('region-chip')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByTestId('region-chip')).toBeNull()

    click(overlay, ON_TITLE)
    expect(screen.getByTestId('region-chip')).toBeTruthy()
    click(overlay, ON_NOTHING)
    expect(screen.queryByTestId('region-chip')).toBeNull()
    expect(onRegionPick).not.toHaveBeenCalled()
  })

  it('the table modes still pick a text-box grid header by clicking the box', () => {
    mockFetch()
    renderCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Header row(s)' }))
    expect(screen.queryByTestId('deck-overlay')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Text-box grid' }))
    fireEvent.click(screen.getByText(TITLE.text))
    expect(screen.getByText(/^table: /)).toBeTruthy()
  })
})
