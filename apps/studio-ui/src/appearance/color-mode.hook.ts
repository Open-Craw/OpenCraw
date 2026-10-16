import { useEffect } from 'react'
import { resolvedColorMode, useColorModeStore } from './color-mode.store'
import type { ColorMode, ColorModePreference } from './color-mode.store'

/**
 * Keeps the page in the mode in force: follows the system while the person has not chosen, and puts the
 * `light`/`dark` class (which Chakra's `_dark` condition reads) and the browser's `color-scheme` on `<html>`.
 * Mount once, in the shell.
 */
export function useApplyColorMode (): void {
  const mode = useColorModeStore(resolvedColorMode)
  const setSystem = useColorModeStore(state => state.setSystem)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => { setSystem(event.matches ? 'dark' : 'light') }
    query.addEventListener('change', onChange)

    return () => { query.removeEventListener('change', onChange) }
  }, [setSystem])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(mode)
    root.style.colorScheme = mode
  }, [mode])
}

/** The preference, the mode in force, and the setter. */
export function useColorMode (): { preference: ColorModePreference, mode: ColorMode, setPreference: (preference: ColorModePreference) => void } {
  const preference = useColorModeStore(state => state.preference)
  const mode = useColorModeStore(resolvedColorMode)
  const setPreference = useColorModeStore(state => state.setPreference)

  return { preference, mode, setPreference }
}
