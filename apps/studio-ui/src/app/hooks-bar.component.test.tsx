import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { HooksBar } from './hooks-bar.component'
import type { LoadedHooks } from '@opencraw/studio'

function renderBar (hooks: LoadedHooks | undefined) {
  return render(<ChakraProvider value={defaultSystem}><HooksBar hooks={hooks} /></ChakraProvider>)
}

describe('HooksBar', () => {
  it('renders nothing when Studio was started without hooks', () => {
    renderBar(undefined)
    expect(screen.queryByTestId('hooks-bar')).toBeNull()
  })

  it('names the file and the hooks, and says it runs as your code', () => {
    renderBar({ source: 'hooks.mjs', names: ['positive', 'slug'] })
    expect(screen.getByTestId('hooks-bar').textContent).toBe('Hooks loaded from hooks.mjs (runs as your code): positive, slug')
  })

  it('says which hooks call outside the machine, and offers a stub for them (issue #201)', () => {
    renderBar({ source: 'hooks.mjs', names: ['price', 'slug'], remote: [{ kind: 'hook', name: 'price', label: 'POST https://svc.example/price' }] })

    expect(screen.getByTestId('hook-stubs').textContent).toContain('call outside this machine')
    expect(screen.getByTestId('remote-price').textContent).toContain('hook price → POST https://svc.example/price')
  })
})
