import { fireEvent, render, screen } from '@testing-library/react'
import { resetRunSessionStore, resetStudioUiStore } from '../studio-store'
import App from './app.view'

class FakeWebSocket {
  addEventListener (): void {}
  close (): void {}
}

class FakeResizeObserver {
  observe (): void {}
  unobserve (): void {}
  disconnect (): void {}
}

beforeAll(() => {
  Object.defineProperties(globalThis, {
    WebSocket:      { value: FakeWebSocket, configurable: true },
    ResizeObserver: { value: FakeResizeObserver, configurable: true },
  })
})

beforeEach(() => {
  history.replaceState({}, '', '/')
  resetStudioUiStore()
  resetRunSessionStore()
})

describe('App shell', () => {
  it('renders the toolbar, the split layout and the preview strip', () => {
    render(<App />)
    expect(screen.getByText('OpenCraw Studio')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recipe ▾' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Load ▾' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run sample' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('All changes saved')
    expect(screen.getByText(/no records yet/i)).toBeTruthy()
  })

  it('starts with Run sample disabled until a recipe is selected', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Run sample' }).hasAttribute('disabled')).toBe(true)
  })

  it('has a Record tab alongside Steps and JSON (issue #92)', () => {
    render(<App />)
    expect(screen.getByText('Record')).toBeTruthy()
  })

  it('keeps "New recipe…" disabled until a workspace folder is open (issue #110)', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Recipe ▾' }))
    expect(screen.getByRole('menuitem', { name: 'New recipe…' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('offers Load ▾ Document… and Web page (URL)… and a drop zone over the whole shell, from the very first screen (issue #120)', async () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Load ▾' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByLabelText('Load document').getAttribute('accept')).toContain('.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Load ▾' }))
    expect(await screen.findByRole('menuitem', { name: 'Document…' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Web page (URL)…' })).toBeTruthy()
    expect(screen.getByTestId('document-drop-zone')).toBeTruthy()
  })

  it('asks the server for its folder dialog from Recipe ▾ → Open folder…, and falls back to the folder box when there is none', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'there is no folder dialog on this machine: type the folder instead' }) })
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })
    history.replaceState({}, '', '/?token=abc')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Recipe ▾' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open folder…' }))
    expect(await screen.findByPlaceholderText('recipe folder')).toBeTruthy()
  })
})

describe('App shell inside the desktop app', () => {
  afterEach(() => { Reflect.deleteProperty(globalThis, 'opencrawDesktop') })

  it('offers the native folder dialog instead of the folder box', async () => {
    const chooseFolder = jest.fn(async () => {})
    Object.defineProperty(globalThis, 'opencrawDesktop', { value: { chooseFolder }, configurable: true })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Recipe ▾' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open folder…' }))
    expect(screen.queryByPlaceholderText('recipe folder')).toBeNull()
    expect(chooseFolder).toHaveBeenCalledTimes(1)
  })
})
