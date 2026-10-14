/** What the extension tells the Studio process at start (as JSON in its first argument). */
export interface HostConfig {
  /** The folder Studio opens first, typically the editor's workspace folder. */
  workspace?: string
  /** A hooks or plugins module to run recipes with, loaded by the process on the person's own authority. */
  hooks?:     string
}

/** What to open in Studio: a folder, a recipe or a document, and the workspace folder a document belongs to. */
export interface LinkTarget {
  open?:      string
  workspace?: string
}

/** What the extension sends the Studio process (`studio-host.process.mjs` reads the same shape): a request for a link, or the answer to a folder dialog the process asked for. */
export type HostRequest = { type: 'link', id: number, target?: LinkTarget } |
  /** The editor's folder dialog answered; `folder` is absent when it was closed without a choice. */
  { type: 'folder', id: number, folder?: string }

/** What the Studio process says: it is serving, here is a link, it could not start, or it needs the editor's folder dialog (Studio's Open folder…). */
export type HostReply = { type: 'ready', url: string } |
  { type: 'link', id: number, url: string } |
  { type: 'choose-folder', id: number } |
  { type: 'failed', message: string }
