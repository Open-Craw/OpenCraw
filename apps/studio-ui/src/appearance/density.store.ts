import { create } from 'zustand'

/** How much room the recipe editor takes: the roomy default, or a tight one that fits more steps on screen. */
export type Density = 'comfortable' | 'compact'

/** The localStorage key the choice is kept under. */
export const DENSITY_KEY = 'opencraw-studio:density'

export interface DensityStore {
  density:    Density
  setDensity: (density: Density) => void
}

function storedDensity (): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export const useDensityStore = create<DensityStore>(set => ({
  density:    storedDensity(),
  setDensity: (density) => {
    try {
      localStorage.setItem(DENSITY_KEY, density)
    } catch {
      // Storage can be blocked: the choice then lasts until the page is closed.
    }
    set({ density })
  },
}))

export function resetDensityStore (): void {
  useDensityStore.setState({ density: storedDensity() })
}
