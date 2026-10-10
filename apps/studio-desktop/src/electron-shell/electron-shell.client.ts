import { BrowserWindow, dialog, Menu, screen, session, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { visibleBounds } from '../window-bounds'
import type { WindowBounds } from '../window-bounds'
import { navigationDecision } from './navigation.policy'

/** A menu entry as the launch logic describes it; mirrors `MenuItemSpec` so no slice imports another's types. */
interface MenuEntry {
  readonly label?:       string
  readonly role?:        MenuItemConstructorOptions['role']
  readonly type?:        'separator'
  readonly accelerator?: string
  readonly enabled?:     boolean
  readonly submenu?:     readonly MenuEntry[]
  readonly action?:      () => void
}

/** The window system, as the launch logic uses it (structurally a `DesktopShell`). */
export interface ElectronShell {
  readonly platform: string
  chooseFolder:      () => Promise<string | undefined>
  showWindow:        (url: string) => void
  focusWindow:       () => void
  setMenu:           (items: readonly MenuEntry[]) => void
  /** Reports where the window is now. The app calls it before it exits, which skips the window's own close. */
  reportPlace:       () => void
  reportProblem:     (message: string) => void
}

function toElectron (entry: MenuEntry): MenuItemConstructorOptions {
  return {
    label:       entry.label,
    role:        entry.role,
    type:        entry.type,
    accelerator: entry.accelerator,
    enabled:     entry.enabled,
    submenu:     entry.submenu?.map(item => toElectron(item)),
    click:       entry.action === undefined ? undefined : () => { entry.action?.() },
  }
}

/** What the shell needs to put the window back where it was and to remember where it ended up. */
export interface ElectronShellOptions {
  /** Where the window was last time; used only if enough of it would still be on a screen. */
  readonly initialBounds?: WindowBounds
  /** Called as the window closes, with where it is. */
  readonly onBounds:       (bounds: WindowBounds) => void
}

/**
 * The app's one window and its native pieces. The window runs the page with no Node access, in a
 * sandbox, and only ever shows the local Studio server: every other address goes to the person's
 * browser or is refused (`navigation.policy.ts`), and the page is granted no permissions.
 *
 * @param options - The window's remembered place and where to report the new one.
 * @returns The shell the launch logic drives.
 */
export function createElectronShell (options: ElectronShellOptions): ElectronShell {
  let window: BrowserWindow | undefined
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })

  const reportPlace = (): void => {
    if (window === undefined || window.isDestroyed()) return
    const { x, y, width, height } = window.getNormalBounds()
    options.onBounds({ x, y, width, height, maximized: window.isMaximized() })
  }

  const guard = (target: BrowserWindow, origin: string): void => {
    target.webContents.setWindowOpenHandler(details => {
      if (navigationDecision(details.url, origin) === 'external') void shell.openExternal(details.url)

      return { action: 'deny' }
    })
    target.webContents.on('will-navigate', (event, url) => {
      const decision = navigationDecision(url, origin)
      if (decision === 'allow') return
      event.preventDefault()
      if (decision === 'external') void shell.openExternal(url)
    })
  }

  return {
    platform:     process.platform,
    chooseFolder: async () => {
      const options = { title: 'Open a recipe folder', properties: ['openDirectory' as const] }
      const result = window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options)

      return result.canceled ? undefined : result.filePaths[0]
    },
    showWindow: url => {
      if (window !== undefined && !window.isDestroyed()) {
        void window.loadURL(url)

        return
      }
      const restored = visibleBounds(options.initialBounds, screen.getAllDisplays().map(display => display.workArea))
      const created = new BrowserWindow({
        width:           restored?.width ?? 1400,
        height:          restored?.height ?? 900,
        x:               restored?.x,
        y:               restored?.y,
        title:           'OpenCraw Studio',
        backgroundColor: '#ffffff',
        webPreferences:  { contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      if (restored?.maximized === true) created.maximize()
      guard(created, new URL(url).origin)
      created.on('close', reportPlace)
      created.on('closed', () => { window = undefined })
      window = created
      void created.loadURL(url)
    },
    focusWindow: () => {
      if (window === undefined || window.isDestroyed()) return
      if (window.isMinimized()) window.restore()
      window.focus()
    },
    reportPlace,
    setMenu:       items => { Menu.setApplicationMenu(Menu.buildFromTemplate(items.map(item => toElectron(item)))) },
    reportProblem: message => { dialog.showErrorBox('OpenCraw Studio', message) },
  }
}
