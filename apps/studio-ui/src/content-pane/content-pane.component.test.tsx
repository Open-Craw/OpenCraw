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

  it('shows an honest placeholder for a document format with no canvas yet (pdf/csv/xlsx/pptx)', async () => {
    mockFetch({ html: '<p>[pdf document]</p>', nodeCount: 0, baseUrl: 'file:///x.pdf', format: 'pdf' })
    renderWithProviders(<ContentPane recipe={recipe()} />)

    await waitFor(() => { expect(screen.getByText(/not built yet/i)).toBeTruthy() })
    expect(document.querySelector('iframe')).toBeNull()
  })
})
