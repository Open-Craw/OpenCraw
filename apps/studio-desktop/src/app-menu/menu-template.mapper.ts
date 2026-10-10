import type { MenuActions, MenuItemSpec } from './menu-item.contract'

const SEPARATOR: MenuItemSpec = { type: 'separator' }

function recentMenu (recent: readonly string[], actions: MenuActions): MenuItemSpec[] {
  if (recent.length === 0) return [{ label: 'No recent folders', enabled: false }]

  return [
    ...recent.map((folder): MenuItemSpec => ({ label: folder, action: () => { actions.openRecent(folder) } })),
    SEPARATOR,
    { label: 'Clear recent folders', action: actions.clearRecent },
  ]
}

/**
 * The application menu: File (open a recipe folder, recent folders), Edit, View and Window, plus the
 * app menu macOS expects first. Everything that is not about folders is a platform role.
 *
 * @param platform - `process.platform`: macOS puts About and Quit in the app menu, the others in File.
 * @param recent - The remembered folders, most recent first.
 * @param actions - What the File menu calls.
 * @returns The menu bar as plain data.
 */
export function menuTemplate (platform: string, recent: readonly string[], actions: MenuActions): MenuItemSpec[] {
  const mac = platform === 'darwin'
  const appMenu: MenuItemSpec[] = mac
    ? [{
        label:   'OpenCraw Studio',
        submenu: [{ role: 'about' }, SEPARATOR, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, SEPARATOR, { role: 'quit' }],
      }]
    : []
  const file: MenuItemSpec = {
    label:   'File',
    submenu: [
      { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', action: actions.openFolder },
      { label: 'Open Recent', submenu: recentMenu(recent, actions) },
      SEPARATOR,
      mac ? { role: 'close' } : { role: 'quit' },
    ],
  }
  const edit: MenuItemSpec = {
    label:   'Edit',
    submenu: [{ role: 'undo' }, { role: 'redo' }, SEPARATOR, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
  }
  const view: MenuItemSpec = {
    label:   'View',
    submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, SEPARATOR,
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, SEPARATOR, { role: 'togglefullscreen' },
    ],
  }
  const windowMenu: MenuItemSpec = {
    label:   'Window',
    submenu: mac ? [{ role: 'minimize' }, { role: 'front' }] : [{ role: 'minimize' }, { role: 'close' }],
  }

  return [...appMenu, file, edit, view, windowMenu]
}
