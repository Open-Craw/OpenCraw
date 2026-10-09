import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { activeStubs } from './active-stubs.algorithm'
import { HookStubs } from './hook-stubs.component'
import { useHookStubsStore } from './hook-stubs.store'

const REMOTE = [
  { kind: 'hook', name: 'price', label: 'POST https://svc.example/price' },
  { kind: 'captcha', name: 'reader', label: 'command python3 read.py' },
] as const

function renderStubs () {
  return render(<ChakraProvider value={defaultSystem}><HookStubs remote={REMOTE} /></ChakraProvider>)
}

describe('HookStubs', () => {
  beforeEach(() => { useHookStubsStore.setState({ entries: {} }) })

  it('says what calls outside the machine, with a stub for a hook and none for a solver', () => {
    renderStubs()

    expect(screen.getByTestId('remote-price').textContent).toContain('hook price → POST https://svc.example/price')
    expect(screen.getByRole('checkbox', { name: 'stub price' })).toBeTruthy()
    expect(screen.getByTestId('remote-reader').textContent).toContain('captcha solver reader → command python3 read.py')
    expect(screen.queryByLabelText('stub reader')).toBeNull()
  })

  it('turns a stub on and holds the typed value for the next run', async () => {
    renderStubs()

    fireEvent.click(screen.getByRole('checkbox', { name: 'stub price' }))
    await waitFor(() => { expect(useHookStubsStore.getState().entries.price?.enabled).toBe(true) })
    fireEvent.change(screen.getByLabelText('stub value of price'), { target: { value: '{"amount": 9}' } })

    expect(activeStubs(useHookStubsStore.getState().entries)).toEqual({ price: { amount: 9 } })
  })

  it('says a typed value that is not JSON is not used', async () => {
    renderStubs()

    fireEvent.click(screen.getByRole('checkbox', { name: 'stub price' }))
    await waitFor(() => { expect(useHookStubsStore.getState().entries.price?.enabled).toBe(true) })
    fireEvent.change(screen.getByLabelText('stub value of price'), { target: { value: 'nope' } })

    expect(screen.getByTestId('remote-price').textContent).toContain('not JSON: the hook is called')
    expect(activeStubs(useHookStubsStore.getState().entries)).toBeUndefined()
  })

  it('renders nothing when nothing is remote', () => {
    render(<ChakraProvider value={defaultSystem}><HookStubs remote={[]} /></ChakraProvider>)

    expect(screen.queryByTestId('hook-stubs')).toBeNull()
  })
})
