import { render, screen } from '@testing-library/react'
import { resetRunSessionStore, resetStudioUiStore } from '../studio-store'
import App from './app'

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
})
