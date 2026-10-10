/** What the desktop app's preload hands the page (`window.opencrawDesktop`); absent in a browser tab. */
export interface DesktopBridge {
  /** Opens the native folder dialog and, when a folder is picked, reloads the window on it. */
  chooseFolder: () => Promise<void>
}

/**
 * @returns The bridge when Studio runs inside the desktop app, `undefined` in a browser: the desktop app
 *   has a native folder dialog, so the toolbar offers that instead of a text field.
 */
export function desktopBridge (): DesktopBridge | undefined {
  const candidate = (globalThis as { opencrawDesktop?: Partial<DesktopBridge> }).opencrawDesktop

  return typeof candidate?.chooseFolder === 'function' ? { chooseFolder: candidate.chooseFolder } : undefined
}
