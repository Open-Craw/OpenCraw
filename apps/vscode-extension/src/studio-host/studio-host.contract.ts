/** What to open in Studio: a folder, a recipe or a document, and the workspace folder a document belongs to. */
export interface LinkTarget {
  open?:      string
  workspace?: string
}

/** What the extension sends the Studio process (`studio-host.process.mjs` reads the same shape). */
export interface HostRequest {
  type:    'link'
  id:      number
  target?: LinkTarget
}

/** What the Studio process answers: it is serving, here is a link, or it could not start. */
export type HostReply = { type: 'ready', url: string } |
  { type: 'link', id: number, url: string } |
  { type: 'failed', message: string }
