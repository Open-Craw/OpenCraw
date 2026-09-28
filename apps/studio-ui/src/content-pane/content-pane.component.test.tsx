import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { RecipeListing } from '@opencraw/studio'
import { createStudioQueryClient } from '../studio-client'
import { resetStudioUiStore } from '../studio-store'
import { ContentPane } from './content-pane.component'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

/** A different answer per command `type` — the tree canvas needs `take-snapshot` (its `format`) and `document-tree` (the tree itself) answered differently, unlike the other tests' single-response `mockFetch`. */
function mockFetchByCommand (responses: Record<string, unknown>): jest.Mock {
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(String(init.body)) as { type: string }

    return { ok: true, status: 200, json: async () => responses[command.type] }
  })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function renderWithProviders (element: React.ReactElement): ReturnType<typeof render> {
  return render(<ChakraProvider value={defaultSystem}><QueryClientProvider client={createStudioQueryClient()}>{element}</QueryClientProvider></ChakraProvider>)
}

function recipe (): RecipeListing {
  return { file: '/r/books.input.json', kind: 'input', id: 'books', issues: [], text: '{}', outline: { recipe: { kind: 'input', id: 'books' }, steps: [] } }
}

beforeEach(() => {
  withUrl('?token=abc123')
  resetStudioUiStore()
})

describe('ContentPane', () => {
  it('shows a placeholder before a recipe is selected', () => {
    renderWithProviders(<ContentPane />)
    expect(screen.getByText(/pick a recipe/i)).toBeTruthy()
  })

  it('takes and shows the selected recipe\'s snapshot', async () => {
    mockFetch({ html: '<p data-oc-node="n0">£10</p>', nodeCount: 1, baseUrl: 'https://x/' })
    renderWithProviders(<ContentPane recipe={recipe()} />)

    await waitFor(() => { expect(document.querySelector('iframe')).toBeTruthy() })
  })

  it('shows the Read button, to enter pick mode', async () => {
    mockFetch({ html: '<p data-oc-node="n0">£10</p>', nodeCount: 1, baseUrl: 'https://x/' })
    renderWithProviders(<ContentPane recipe={recipe()} />)
    await waitFor(() => { expect(screen.getByText('Read')).toBeTruthy() })
  })

  it('shows the tree canvas (not the iframe) for a JSON snapshot, and a value pick writes a jsonpath Read card', async () => {
    mockFetchByCommand({
      'take-snapshot': { html: '<pre>{}</pre>', nodeCount: 0, baseUrl: 'file:///pokemon.json', format: 'json' },
      'document-tree': {
        format: 'json',
        root:   {
          id:        '$',
          label:     'root',
          valueType: 'object',
          jsonpath:  '$',
          children:  [
            { id: '$.name', label: 'name', valueType: 'string', preview: 'bulbasaur', jsonpath: '$.name', children: [] },
          ],
        },
      },
    })
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    renderWithProviders(<ContentPane recipe={recipe()} onSaveOutline={onSaveOutline} />)

    await waitFor(() => { expect(screen.getByText('name')).toBeTruthy() })
    expect(document.querySelector('iframe')).toBeNull() // the tree canvas, not the snapshot iframe, for a json snapshot
    expect(screen.queryByText('Read')).toBeNull() // the DOM picker's own toggle is meaningless here — every tree row picks on click

    fireEvent.click(screen.getByText('name'))

    await waitFor(() => { expect(onSaveOutline).toHaveBeenCalledTimes(1) })
    const [, outline] = onSaveOutline.mock.calls[0] as [string, { steps: { step: unknown }[] }]
    expect(outline.steps.at(-1)?.step).toEqual({ type: 'extract', id: 'value', selector: '$.name', kind: 'jsonpath' })
    expect(screen.getByText(/read card: \$\.name/i)).toBeTruthy()
  })

  it('shows an honest placeholder for a document format with no canvas yet (the deck, issue #94 5d)', async () => {
    mockFetch({ html: '<p>[pptx document]</p>', nodeCount: 0, baseUrl: 'file:///x.pptx', format: 'pptx' })
    renderWithProviders(<ContentPane recipe={recipe()} />)

    await waitFor(() => { expect(screen.getByText(/not built yet/i)).toBeTruthy() })
    expect(document.querySelector('iframe')).toBeNull()
  })

  // The grid, like the Inspect panel's DOM tree, is virtualized (@tanstack/react-virtual): jsdom reports a
  // zero-size scroll container, so no row/cell ever mounts here (mirrors `inspector-panel.component.test.tsx`'s
  // own note). Its cell picking is covered by `grid-pick.mapper.test.ts`'s pure functions and
  // `packages/studio/e2e/grid-canvas.e2e.test.ts` (a real browser is not needed there either — api mode, same as
  // `pdf-canvas.e2e.test.ts`); this test only proves the canvas (not the iframe/placeholder) is chosen, and that
  // its non-virtualized chrome (the sheet tabs, the CSV format controls) renders.
  it('shows the grid canvas (not the iframe, not the placeholder) for a CSV snapshot, with its sheet tab and detected CSV format', async () => {
    mockFetchByCommand({
      'take-snapshot': { html: '<p>[csv document]</p>', nodeCount: 0, baseUrl: 'file:///listino.csv', format: 'csv' },
      'grid-view':     {
        sheets: [
          {
            name:        'listino',
            hidden:      false,
            hiddenRows:  [],
            columnCount: 2,
            rows:        [[{ value: 'Marca', type: 'string' }, { value: 'Modello', type: 'string' }], [{ value: 'Fiat', type: 'string' }, { value: 'Pandina', type: 'string' }]],
            merges:      [],
          },
        ],
        csv: { encoding: 'windows-1252', delimiter: ';' },
      },
      'grid-preview': { matches: [] },
    })
    renderWithProviders(<ContentPane recipe={recipe()} />)

    await waitFor(() => { expect(screen.getByText('listino')).toBeTruthy() }) // the sheet tab
    expect(screen.queryByText(/not built yet/i)).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByText('Header row(s)')).toBeTruthy() // a mode button, not the DOM picker's "Read" button
    expect(screen.queryByText('Read')).toBeNull()
    expect(screen.getByDisplayValue(';')).toBeTruthy() // the detected delimiter, shown and editable
  })

  it('shows the PDF canvas (not the iframe, not the placeholder) for a PDF snapshot', async () => {
    mockFetchByCommand({
      'take-snapshot': { html: '<p>[pdf document]</p>', nodeCount: 0, baseUrl: 'file:///discounts.pdf', format: 'pdf' },
      'pdf-view':      {
        pages: [
          {
            number:       1,
            width:        595,
            height:       842,
            rows:         [{ top: 700, bottom: 693, cells: [{ x: 40, y: 693, width: 90, height: 7, text: 'MODELS ALPHA' }] }],
            rowCount:     1,
            cellCount:    1,
            hasTextLayer: true,
          },
        ],
      },
    })
    renderWithProviders(<ContentPane recipe={recipe()} />)

    await waitFor(() => { expect(screen.getByText(/header row/i)).toBeTruthy() })
    expect(screen.queryByText(/not built yet/i)).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByText(/1 rows, 1 cells/i)).toBeTruthy()
  })
})
