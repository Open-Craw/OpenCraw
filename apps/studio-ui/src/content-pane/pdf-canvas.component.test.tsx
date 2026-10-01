import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { OutlineCard, PdfDocumentView } from '@opencraw/studio'
import { CARD_DRAG_MIME } from '../steps-outline'
import { createStudioQueryClient } from '../studio-client'
import { PdfCanvas } from './pdf-canvas.component'

// `renderPdfPage` loads pdf.js on the fly to draw the bitmap; the overlay under test is built from `pdf-view`'s geometry alone.
const mockPdfPage = { getViewport: () => ({ width: 1, height: 1 }), render: () => ({ promise: Promise.resolve() }) }
const mockDocument = { getPage: async () => mockPdfPage }
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument:         () => ({ promise: Promise.resolve(mockDocument), destroy: async () => {} }),
}), { virtual: true })
jest.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }), { virtual: true })

const TITLE = { x: 72, y: 800, width: 200, height: 12, text: 'DEALER DISCOUNTS - SEPTEMBER 2026' }
const NOTE = { x: 72, y: 700, width: 100, height: 10, text: 'NOTE: before 01/07/2025' }
const VIEW: PdfDocumentView = {
  pages: [{
    number:       1,
    width:        595,
    height:       842,
    rowCount:     2,
    cellCount:    2,
    hasTextLayer: true,
    rows:         [{ top: 812, bottom: 800, cells: [TITLE] }, { top: 710, bottom: 700, cells: [NOTE] }],
  }],
}

interface SentCommand { type: string, selector?: string }

/** Answers `region-preview` as the engine would for these two cells: whichever of them sit inside the selector's box. */
function mockFetch (): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(init.body as string) as SentCommand
    if (command.type !== 'region-preview') return { ok: true, status: 200, json: async () => ({ matches: [] }) }
    const match = /y=(-?\d+)\.\.(-?\d+)/.exec(command.selector ?? '')
    const [y1, y2] = match === null ? [0, 0] : [Number(match[1]), Number(match[2])]
    const cells = [TITLE, NOTE].filter(cell => cell.y >= y1 && cell.y + cell.height <= y2)

    return { ok: true, status: 200, json: async () => ({ matches: cells.length === 0 ? [] : [{ page: 1, text: cells.map(cell => cell.text).join('\n'), cells }] }) }
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
        <PdfCanvas recipeId='discounts' stepPath='start' view={VIEW} bytesUrl='/api/pdf-bytes' onTablePick={() => {}} onRegionPick={onRegionPick} />
      </ChakraProvider>
    </QueryClientProvider>,
  )
}

/** The title cell's pixel box at the canvas's own 1.5 scale: left 108, top (842-800-12)*1.5 = 45, 300 wide, ~21.6 tall; the note's: top (842-700-10)*1.5 = 198. */
const ON_TITLE = { clientX: 150, clientY: 55 }
const ON_NOTE = { clientX: 120, clientY: 205 }
const ON_NOTHING = { clientX: 700, clientY: 1000 }

function click (target: Element, at: { clientX: number, clientY: number }, shiftKey = false): void {
  fireEvent.mouseDown(target, { ...at, button: 0, shiftKey })
  fireEvent.mouseUp(target, { ...at, button: 0, shiftKey })
}

beforeAll(() => {
  history.replaceState({}, '', '/?token=abc123')
  // jsdom has no 2d canvas; the overlay never needs one.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true })
})

describe('PdfCanvas text mode (issue #121)', () => {
  it('starts in Text mode and snaps to the line under the mouse, clearing when the mouse leaves', () => {
    mockFetch()
    renderCanvas()
    const overlay = screen.getByTestId('pdf-overlay')

    fireEvent.mouseMove(overlay, ON_TITLE)
    expect(screen.getByTestId('snap-target')).toBeTruthy()
    fireEvent.mouseMove(overlay, ON_NOTHING)
    expect(screen.queryByTestId('snap-target')).toBeNull()
    fireEvent.mouseMove(overlay, ON_TITLE)
    fireEvent.mouseLeave(overlay)
    expect(screen.queryByTestId('snap-target')).toBeNull()
  })

  it('a click stages the snapped line: its box goes to region-preview, and the chip shows the engine\'s own text', async () => {
    const fetchMock = mockFetch()
    renderCanvas()
    const overlay = screen.getByTestId('pdf-overlay')

    click(overlay, ON_TITLE)

    expect(screen.getByTestId('staged-region')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText(TITLE.text)).toBeTruthy() })
    expect(sentSelectors(fetchMock)).toEqual(['page=1 x=71..273 y=799..813'])
    expect(screen.getAllByTestId('staged-cell')).toHaveLength(1)
  })

  it('"Add to recipe" hands over a region card named after the text, and clears the selection', async () => {
    mockFetch()
    const onRegionPick = jest.fn()
    renderCanvas(onRegionPick)
    click(screen.getByTestId('pdf-overlay'), ON_TITLE)
    await waitFor(() => { expect(screen.getByText(TITLE.text)).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'Add to recipe' }))

    expect(onRegionPick).toHaveBeenCalledTimes(1)
    const [card] = onRegionPick.mock.calls[0] as [OutlineCard]
    expect(card.step).toEqual({ type: 'extract', id: 'dealerDiscountsSeptember2026', kind: 'region', selector: 'page=1 x=71..273 y=799..813' })
    expect(screen.queryByTestId('region-chip')).toBeNull()
  })

  it('shift+click extends the selection to a second line: one box around both, both texts', async () => {
    const fetchMock = mockFetch()
    renderCanvas()
    const overlay = screen.getByTestId('pdf-overlay')

    click(overlay, ON_TITLE)
    click(overlay, ON_NOTE, true)

    await waitFor(() => { expect(sentSelectors(fetchMock)).toContain('page=1 x=71..273 y=699..813') })
    await waitFor(() => { expect(screen.getAllByTestId('staged-cell')).toHaveLength(2) })
  })

  it('a drag stages the box drawn, in points, instead of snapping', async () => {
    const fetchMock = mockFetch()
    renderCanvas()
    const overlay = screen.getByTestId('pdf-overlay')

    fireEvent.mouseDown(overlay, { clientX: 90, clientY: 30, button: 0 })
    fireEvent.mouseMove(overlay, { clientX: 450, clientY: 230 })
    fireEvent.mouseUp(overlay, { clientX: 450, clientY: 230, button: 0 })

    // 90px → 60pt, 30px → 842-20 = 822pt; 450px → 300pt, 230px → 842-153.33 = 688.67pt
    await waitFor(() => { expect(sentSelectors(fetchMock)).toEqual(['page=1 x=60..300 y=689..822']) })
    await waitFor(() => { expect(screen.getAllByTestId('staged-cell')).toHaveLength(2) })
  })

  it('the chip can be dragged, carrying the same region card for the Steps tab to drop', async () => {
    mockFetch()
    renderCanvas()
    click(screen.getByTestId('pdf-overlay'), ON_TITLE)
    await waitFor(() => { expect(screen.getByText(TITLE.text)).toBeTruthy() })
    const setData = jest.fn()

    fireEvent.dragStart(screen.getByTestId('region-chip'), { dataTransfer: { setData, effectAllowed: 'none' } })

    const payload = setData.mock.calls.find(([type]) => type === CARD_DRAG_MIME)?.[1] as string
    expect(JSON.parse(payload)).toMatchObject({ kind: 'card', step: { kind: 'region', selector: 'page=1 x=71..273 y=799..813' } })
  })

  it('clearing the selection, or clicking empty page, drops the chip; nothing is written meanwhile', async () => {
    mockFetch()
    const onRegionPick = jest.fn()
    renderCanvas(onRegionPick)
    const overlay = screen.getByTestId('pdf-overlay')
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

  it('the table modes still pick a header row by clicking it', () => {
    mockFetch()
    renderCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Header row' }))
    expect(screen.queryByTestId('snap-target')).toBeNull()
    // The row overlay's own click: the first row's group
    const overlay = screen.getByTestId('pdf-overlay')
    fireEvent.click(overlay.querySelector('g') as Element)
    expect(screen.getByText(/^table: /)).toBeTruthy()
  })
})
