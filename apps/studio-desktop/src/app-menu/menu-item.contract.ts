/** The platform roles the app's menus use. A subset of what Electron offers, so the menu can be built and tested without it. */
export type MenuRole =
  | 'about' | 'hide' | 'hideOthers' | 'unhide' | 'quit' | 'close' |
  'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' |
  'reload' | 'forceReload' | 'toggleDevTools' | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'togglefullscreen' |
  'minimize' | 'front'

/** One entry of a menu: a role the platform handles, or a label with an `action`, or a separator, or a submenu. */
export interface MenuItemSpec {
  readonly label?:       string
  readonly role?:        MenuRole
  readonly type?:        'separator'
  readonly accelerator?: string
  readonly enabled?:     boolean
  readonly submenu?:     readonly MenuItemSpec[]
  readonly action?:      () => void
}

/** What the File menu can ask the app to do. */
export interface MenuActions {
  openFolder:  () => void
  openRecent:  (folder: string) => void
  clearRecent: () => void
}
