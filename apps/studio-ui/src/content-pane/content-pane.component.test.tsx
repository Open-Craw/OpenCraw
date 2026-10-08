import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { RecipeListing } from '@opencraw/studio'
import { createStudioQueryClient } from '../studio-client'
import { resetRecordingStore, resetStudioUiStore, useRecordingStore } from '../studio-store'
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

/** A recipe with a real `start` point, so `handleStartRecording`/`handleMakeLogin`/`handleKeepAsSteps` (issue #95) have a URL to work with. */
function recordableRecipe (extraSteps: unknown[] = []): RecipeListing {
  return {
    file:    '/r/login.input.json',
    kind:    'input',
    id:      'login',
    issues:  [],
    text:    '{}',
    outline: { recipe: { kind: 'input', id: 'login', start: [{ url: 'http://127.0.0.1:4599/login' }] }, steps: extraSteps.map((step, index) => ({ kind: 'card' as const, path: `steps.${index}`, stepType: (step as { type: string }).type, sentence: [], step: step as Record<string, unknown>, custom: false })) },
  }
}

beforeEach(() => {
  withUrl('?token=abc123')
  resetStudioUiStore()
  resetRecordingStore()
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

  it('says why when the snapshot fails, instead of the empty-state text (issue #142)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'connect ECONNREFUSED 127.0.0.1:4580' }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })
    renderWithProviders(<ContentPane recipe={recipe()} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('ECONNREFUSED')
    expect(screen.queryByText(/run a sample, or open a recipe/i)).toBeNull()
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

  it('shows the deck canvas (not the iframe, not a placeholder) for a pptx snapshot, with its slide select and side panel', async () => {
    mockFetchByCommand({
      'take-snapshot': { html: '<p>[pptx document]</p>', nodeCount: 0, baseUrl: 'file:///incentivi.pptx', format: 'pptx' },
      'deck-view':     {
        width:  960,
        height: 540,
        slides: [
          {
            number:    1,
            title:     'Incentivi giugno',
            hidden:    false,
            shapes:    [{ x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }],
            shapeRows: [[0]],
            tables:    [{ name: 'table 1', hidden: false, hiddenRows: [], columnCount: 2, rows: [[{ value: 'Modello', type: 'string' }, { value: 'Prezzo', type: 'string' }]], merges: [] }],
            charts:    [{ type: 'bar', title: 'Immatricolazioni', series: [{ name: 'Pandina', categories: ['Aprile'], values: [1200] }] }],
            notes:     'Prezzi IVA inclusa.',
          },
        ],
      },
    })
    renderWithProviders(<ContentPane recipe={recipe()} />)

    await waitFor(() => { expect(screen.getByText('table 1')).toBeTruthy() }) // the native table entry in the side list
    expect(screen.queryByText(/not built yet/i)).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('button', { name: 'Text' })).toBeTruthy() // the deck canvas's own Text mode (#122), not the DOM picker's "Read" button
    expect(screen.queryByText('Read')).toBeNull()
    expect(screen.getByText('Immatricolazioni')).toBeTruthy() // the chart entry in the side list
    expect(screen.getByText('Prezzi IVA inclusa.')).toBeTruthy() // the notes
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

  it('the Record button sends start-recording with the recipe\'s own start url, and shows the banner once active', async () => {
    const fetchMock = mockFetchByCommand({
      'take-snapshot':   { html: '<p data-oc-node="n0">Log in</p>', nodeCount: 1, baseUrl: 'https://x/' },
      'start-recording': { started: true },
    })
    renderWithProviders(<ContentPane recipe={recordableRecipe()} />)

    await waitFor(() => { expect(screen.getByText('Record')).toBeTruthy() })
    fireEvent.click(screen.getByText('Record'))

    await waitFor(() => { expect(screen.getByText('Stop recording')).toBeTruthy() })
    expect(screen.getByTestId('recording-banner')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'start-recording', recipeId: 'login' }),
    }))
  })

  it('the Stop recording button sends stop-recording', async () => {
    const fetchMock = mockFetchByCommand({
      'take-snapshot':  { html: '<p data-oc-node="n0">Log in</p>', nodeCount: 1, baseUrl: 'https://x/' },
      'stop-recording': { steps: [] },
    })
    renderWithProviders(<ContentPane recipe={recordableRecipe()} />)
    await waitFor(() => { expect(screen.getByText('Record')).toBeTruthy() })
    act(() => { useRecordingStore.getState().startRecording('login', 'http://127.0.0.1:4599/login') })

    fireEvent.click(screen.getByText('Stop recording'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
        body: JSON.stringify({ type: 'stop-recording' }),
      }))
    })
  })

  it('shows the "make this the login" / "keep as steps" bar once the recording stops, for this recipe only', async () => {
    mockFetch({ html: '<p data-oc-node="n0">Log in</p>', nodeCount: 1, baseUrl: 'https://x/' })
    renderWithProviders(<ContentPane recipe={recordableRecipe()} />)
    await waitFor(() => { expect(screen.getByText('Record')).toBeTruthy() })

    act(() => { useRecordingStore.getState().startRecording('a-different-recipe', 'http://x/') })
    act(() => { useRecordingStore.getState().recordingStopped([{ type: 'fill' }]) })
    expect(screen.queryByTestId('recording-stopped-bar')).toBeNull() // a different recipe's recording

    act(() => { useRecordingStore.getState().startRecording('login', 'http://127.0.0.1:4599/login') })
    act(() => { useRecordingStore.getState().recordingStopped([{ type: 'fill', selector: '#user', value: 'alice' }]) })
    expect(screen.getByTestId('recording-stopped-bar')).toBeTruthy()
    expect(screen.getByText(/1 step recorded/)).toBeTruthy()
  })

  it('"Make this the login" writes session.bootstrap with a restoring goto, keep: [cookies] and a suggested saveTo, and leaves the recipe\'s own steps untouched', async () => {
    mockFetch({ html: '<p data-oc-node="n0">Log in</p>', nodeCount: 1, baseUrl: 'https://x/' })
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    const existing = recordableRecipe([{ type: 'extract', id: 'heading', selector: 'h1', kind: 'css' }])
    renderWithProviders(<ContentPane recipe={existing} onSaveOutline={onSaveOutline} />)
    await waitFor(() => { expect(screen.getByText('Record')).toBeTruthy() })

    const fillUser = { type: 'fill', selector: '#user', value: 'alice' }
    const fillPass = { type: 'fill', selector: '#pass', value: '{{env.PASS}}' }
    const clickSubmit = { type: 'click', selector: '#submit' }
    act(() => { useRecordingStore.getState().startRecording('login', 'http://127.0.0.1:4599/login') })
    act(() => {
      useRecordingStore.getState().addCard({ node: { kind: 'card', path: 'steps.0', stepType: 'fill', sentence: [], custom: false, step: fillUser }, secret: false })
      useRecordingStore.getState().addCard({ node: { kind: 'card', path: 'steps.1', stepType: 'fill', sentence: [], custom: false, step: fillPass }, secret: true })
      useRecordingStore.getState().addCard({ node: { kind: 'card', path: 'steps.2', stepType: 'click', sentence: [], custom: false, step: clickSubmit }, secret: false })
      useRecordingStore.getState().recordingStopped([fillUser, fillPass, clickSubmit])
    })

    fireEvent.click(screen.getByRole('button', { name: /make this the login/i }))

    await waitFor(() => { expect(onSaveOutline).toHaveBeenCalledTimes(1) })
    const [path, savedOutline] = onSaveOutline.mock.calls[0] as [string, { recipe: Record<string, unknown>, steps: { step: unknown }[] }]
    expect(path).toBe('/r/login.input.json')
    expect(savedOutline.recipe.session).toEqual({
      bootstrap: {
        steps:  [{ type: 'goto', url: 'http://127.0.0.1:4599/login' }, fillUser, fillPass, clickSubmit],
        keep:   ['cookies'],
        saveTo: '/r/storage/login-session.json',
      },
    })
    // The recipe's own steps (not part of the recording) are untouched.
    expect(savedOutline.steps.map(step => step.step)).toEqual([{ type: 'extract', id: 'heading', selector: 'h1', kind: 'css' }])
    // The password never made it in as anything but its {{env.PASS}} placeholder (the recording already replaced it before this ever reaches the client — `secret-field.policy.ts`, server-side).
    expect(JSON.stringify(savedOutline)).not.toContain('"value":"hunter2')
    // The bar is dismissed once resolved.
    expect(screen.queryByTestId('recording-stopped-bar')).toBeNull()
  })

  it('"Keep as steps" appends a restoring goto and every recorded card to the recipe\'s own steps, never replacing them', async () => {
    mockFetch({ html: '<p data-oc-node="n0">Search</p>', nodeCount: 1, baseUrl: 'https://x/' })
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    const existing = recordableRecipe([{ type: 'goto', url: 'http://127.0.0.1:4599/search' }])
    renderWithProviders(<ContentPane recipe={existing} onSaveOutline={onSaveOutline} />)
    await waitFor(() => { expect(screen.getByText('Record')).toBeTruthy() })

    const fillQ = { type: 'fill', selector: '#q', value: 'widgets' }
    act(() => { useRecordingStore.getState().startRecording('login', 'http://127.0.0.1:4599/search') })
    act(() => {
      useRecordingStore.getState().addCard({ node: { kind: 'card', path: 'steps.0', stepType: 'fill', sentence: [{ kind: 'word', text: 'Fill' }], custom: false, step: fillQ }, secret: false })
      useRecordingStore.getState().recordingStopped([fillQ])
    })

    fireEvent.click(screen.getByRole('button', { name: /keep as steps/i }))

    await waitFor(() => { expect(onSaveOutline).toHaveBeenCalledTimes(1) })
    const [, savedOutline] = onSaveOutline.mock.calls[0] as [string, { steps: { step: unknown }[] }]
    expect(savedOutline.steps.map(step => step.step)).toEqual([
      { type: 'goto', url: 'http://127.0.0.1:4599/search' }, // the recipe's own, pre-existing step, untouched
      { type: 'goto', url: 'http://127.0.0.1:4599/search' }, // the recording's own restoring goto
      fillQ,
    ])
  })

  it('"Discard" clears the bar without saving anything', async () => {
    mockFetch({ html: '<p data-oc-node="n0">Log in</p>', nodeCount: 1, baseUrl: 'https://x/' })
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    renderWithProviders(<ContentPane recipe={recordableRecipe()} onSaveOutline={onSaveOutline} />)
    await waitFor(() => { expect(screen.getByText('Record')).toBeTruthy() })

    act(() => { useRecordingStore.getState().startRecording('login', 'http://127.0.0.1:4599/login') })
    act(() => { useRecordingStore.getState().recordingStopped([{ type: 'fill' }]) })
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))

    expect(screen.queryByTestId('recording-stopped-bar')).toBeNull()
    expect(onSaveOutline).not.toHaveBeenCalled()
  })
})
