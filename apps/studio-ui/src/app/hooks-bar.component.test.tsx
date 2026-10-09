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
})
