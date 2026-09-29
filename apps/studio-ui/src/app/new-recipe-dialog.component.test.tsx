import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createStudioQueryClient } from '../studio-client'
import { NewRecipeDialog } from './new-recipe-dialog.component'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
}

function mockFetch (): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ saved: true }) })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

function renderDialog (props: Partial<{ folder?: string, onCreated: (id: string) => void }> = {}) {
  const queryClient = createStudioQueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <NewRecipeDialog folder='/r' onCreated={() => {}} {...props} />
      </ChakraProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => { withUrl('?token=abc123') })

describe('NewRecipeDialog', () => {
  it('disables the trigger when no workspace folder is open', () => {
    renderDialog({ folder: undefined })
    expect(screen.getByRole('button', { name: '+ New recipe' }).hasAttribute('disabled')).toBe(true)
  })

  it('opens the dialog and flags an invalid id, keeping Create disabled', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '+ New recipe' }))
    fireEvent.change(await screen.findByPlaceholderText('books'), { target: { value: 'Not Valid!' } })
    expect(screen.getByText(/lowercase letters, digits and hyphens/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' }).hasAttribute('disabled')).toBe(true)
  })

  it('saves a minimal output then input recipe under the open folder, and calls onCreated', async () => {
    const fetchMock = mockFetch()
    const onCreated = jest.fn()
    renderDialog({ onCreated })

    fireEvent.click(screen.getByRole('button', { name: '+ New recipe' }))
    fireEvent.change(await screen.findByPlaceholderText('books'), { target: { value: 'widgets' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => { expect(onCreated).toHaveBeenCalledWith('widgets') })

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as { type: string, path: string, recipe: Record<string, unknown> })
    expect(bodies[0]).toMatchObject({ type: 'save-recipe', path: '/r/widgets.output.json', recipe: { kind: 'output', id: 'widgets', version: 1, fields: {} } })
    expect(bodies[1]).toMatchObject({ type: 'save-recipe', path: '/r/widgets.input.json', recipe: { kind: 'input', id: 'widgets', output: 'widgets', mode: 'web' } })
  })

  it('shows the write error and leaves the dialog open when a save fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'disk full' }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '+ New recipe' }))
    fireEvent.change(await screen.findByPlaceholderText('books'), { target: { value: 'widgets' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => { expect(screen.getByText(/disk full/)).toBeTruthy() })
    expect(screen.getByPlaceholderText('books')).toBeTruthy()
  })
})
