import { create } from 'zustand'

/** What the person chose: follow the system, or one mode for good. */
export type ColorModePreference = 'system' | 'light' | 'dark'
/** What is actually shown. */
export type ColorMode = 'light' | 'dark'

/** The localStorage key the choice is kept under (also read by the inline script in `index.html`, which sets the mode before the first paint). */
export const COLOR_MODE_KEY = 'opencraw-studio:color-mode'

export interface ColorModeState {
  preference: ColorModePreference
  /** The system's own setting, kept up to date by `useApplyColorMode`. */
  system:     ColorMode
}

export interface ColorModeActions {
  setPreference: (preference: ColorModePreference) => void
  setSystem:     (mode: ColorMode) => void
}

export type ColorModeStore = ColorModeState & ColorModeActions

function storedPreference (): ColorModePreference {
  try {
    const value = localStorage.getItem(COLOR_MODE_KEY)

    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function systemMode (): ColorMode {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The mode in force: the person's own choice, else the system's. */
export function resolvedColorMode (state: ColorModeState): ColorMode {
  return state.preference === 'system' ? state.system : state.preference
}

export const useColorModeStore = create<ColorModeStore>(set => ({
  preference:    storedPreference(),
  system:        systemMode(),
  setPreference: (preference) => {
    try {
      if (preference === 'system') localStorage.removeItem(COLOR_MODE_KEY)
      else localStorage.setItem(COLOR_MODE_KEY, preference)
    } catch {
      // Storage can be blocked: the choice then lasts until the page is closed.
    }
    set({ preference })
  },
  setSystem: (system) => { set({ system }) },
}))

export function resetColorModeStore (): void {
  useColorModeStore.setState({ preference: storedPreference(), system: systemMode() })
}
