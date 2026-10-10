import type { MenuItemSpec } from '../app-menu'

/** What the launch logic needs from the window system. The Electron adapter implements it; tests use a fake. */
export interface DesktopShell {
  /** `process.platform`: decides the shape of the menu. */
  readonly platform: string
  /** Asks the person for a folder. `undefined` when they cancel. */
  chooseFolder:      () => Promise<string | undefined>
  /** Shows the one window at `url`: creates it the first time, navigates it afterwards. */
  showWindow:        (url: string) => void
  focusWindow:       () => void
  setMenu:           (items: readonly MenuItemSpec[]) => void
  /** Tells the person something went wrong, in words. */
  reportProblem:     (message: string) => void
}

/** A running Studio server: where to point the window, and how to stop it. */
export interface RunningStudio {
  readonly url: string
  close:        () => Promise<void>
}
