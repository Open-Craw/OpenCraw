import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { InspectView, RecipeListing, SnapshotView } from '@opencraw/studio'
import { createStudioQueryClient } from '../studio-client'
import { InspectorPanel } from './inspector-panel.component'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function renderWithProviders (element: React.ReactElement): ReturnType<typeof render> {
  return render(<ChakraProvider value={defaultSystem}><QueryClientProvider client={createStudioQueryClient()}>{element}</QueryClientProvider></ChakraProvider>)
}

function recipe (): RecipeListing {
  return { file: '/r/books.input.json', kind: 'input', id: 'books', issues: [], text: '{}', outline: { recipe: { kind: 'input', id: 'books' }, steps: [] } }
}

function snapshot (): SnapshotView {
  return { html: '<html data-oc-node="n0"><body data-oc-node="n1"></body></html>', nodeCount: 2, baseUrl: 'https://x/' }
}

function inspectView (): InspectView {
  return {
    tree:     { nodeId: 'n0', tag: 'html', attributes: {}, hidden: false, children: [{ nodeId: 'n1', tag: 'body', attributes: {}, hidden: false, children: [] }] },
    pageData: [{ kind: 'meta', label: 'meta: description', selector: 'meta', selectorKind: 'css', matches: 1, attribute: 'content' }],
  }
}

beforeEach(() => { withUrl('?token=abc123') })

describe('InspectorPanel', () => {
  // The tree itself is virtualized (@tanstack/react-virtual): jsdom reports a zero-size scroll container, so no
  // row ever mounts here — `dom-tree-view.component.tsx`'s own rendering is covered by `packages/studio/e2e/inspector.e2e.test.ts`
  // (a real browser) and by `flatten-tree.mapper.test.ts`/`tree-row.component.tsx`'s inputs being plain, testable data.
  it('shows the Tree/Data in page/Responses tabs, the "data in page" count badge included', async () => {
    mockFetch(inspectView())
    renderWithProviders(<InspectorPanel recipeId='books' recipe={recipe()} snapshot={snapshot()} />)

    expect(screen.getByText('Tree')).toBeTruthy()
    expect(screen.getByText('Responses')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('1')).toBeTruthy() }) // the "Data in page" tab's count badge, once inspect-page resolves
  })

  it('shows the data-in-page findings once the "Data in page" tab is picked', async () => {
    mockFetch(inspectView())
    renderWithProviders(<InspectorPanel recipeId='books' recipe={recipe()} snapshot={snapshot()} />)
    await waitFor(() => { expect(screen.getByText('1')).toBeTruthy() })
    fireEvent.click(screen.getByText('Data in page'))
    await waitFor(() => { expect(screen.getByText('meta: description')).toBeTruthy() })
  })
})
