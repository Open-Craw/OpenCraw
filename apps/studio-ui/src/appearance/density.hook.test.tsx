import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { DensityToggle } from './density-toggle.component'
import { useDensity } from './density.hook'
import { DENSITY_KEY, resetDensityStore } from './density.store'
import { studioSystem } from './studio-theme.config'

function Probe () {
  return <span data-testid='probe'>{useDensity().compact ? 'compact' : 'comfortable'}</span>
}

beforeEach(() => {
  localStorage.clear()
  resetDensityStore()
})

describe('density', () => {
  it('is comfortable until the person picks compact, and keeps the choice', () => {
    render(<ChakraProvider value={studioSystem}><DensityToggle /><Probe /></ChakraProvider>)
    expect(screen.getByTestId('probe').textContent).toBe('comfortable')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(screen.getByTestId('probe').textContent).toBe('compact')
    expect(localStorage.getItem(DENSITY_KEY)).toBe('compact')
    fireEvent.click(screen.getByRole('button', { name: 'Comfort' }))
    expect(screen.getByTestId('probe').textContent).toBe('comfortable')
  })
})
