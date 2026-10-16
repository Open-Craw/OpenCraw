import { ChakraProvider } from '@chakra-ui/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ColorModeToggle } from './color-mode-toggle.component'
import { useApplyColorMode } from './color-mode.hook'
import { COLOR_MODE_KEY, resetColorModeStore, useColorModeStore } from './color-mode.store'
import { studioSystem } from './studio-theme.config'

function Harness () {
  useApplyColorMode()

  return <ColorModeToggle />
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  resetColorModeStore()
})

describe('colour mode', () => {
  it('follows the system until the person chooses', () => {
    render(<ChakraProvider value={studioSystem}><Harness /></ChakraProvider>)
    expect(document.documentElement.classList.contains('light')).toBe(true)
    act(() => { useColorModeStore.getState().setSystem('dark') })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('steps through light, dark and system, and keeps the choice', () => {
    render(<ChakraProvider value={studioSystem}><Harness /></ChakraProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Theme: System/ }))
    expect(localStorage.getItem(COLOR_MODE_KEY)).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: /Theme: Light/ }))
    expect(localStorage.getItem(COLOR_MODE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
    expect(localStorage.getItem(COLOR_MODE_KEY)).toBeNull()
  })

  it('keeps a chosen mode when the system changes', () => {
    render(<ChakraProvider value={studioSystem}><Harness /></ChakraProvider>)
    act(() => { useColorModeStore.getState().setPreference('light') })
    act(() => { useColorModeStore.getState().setSystem('dark') })
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })
})
