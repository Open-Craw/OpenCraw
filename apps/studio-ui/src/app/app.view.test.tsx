import { render, screen } from '@testing-library/react'
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
    expect(screen.getByPlaceholderText('recipe folder')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run sample' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(screen.getByText(/select a recipe/i)).toBeTruthy()
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

  it('disables "+ New recipe" until a workspace folder is open (issue #110)', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '+ New recipe' }).hasAttribute('disabled')).toBe(true)
  })

  it('offers "Open document…" and a drop zone over the whole shell, from the very first screen (issue #120)', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Open document…' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByLabelText('Open document').getAttribute('accept')).toContain('.pdf')
    expect(screen.getByTestId('document-drop-zone')).toBeTruthy()
  })
})

describe('App shell inside the desktop app', () => {
  afterEach(() => { Reflect.deleteProperty(globalThis, 'opencrawDesktop') })

  it('offers the native folder dialog instead of the folder box', async () => {
    const chooseFolder = jest.fn(async () => {})
    Object.defineProperty(globalThis, 'opencrawDesktop', { value: { chooseFolder }, configurable: true })
    render(<App />)

    expect(screen.queryByPlaceholderText('recipe folder')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    screen.getByRole('button', { name: 'Open folder…' }).click()
    expect(chooseFolder).toHaveBeenCalledTimes(1)
  })
})
