import { render, screen, waitFor } from '@testing-library/react'
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
})
