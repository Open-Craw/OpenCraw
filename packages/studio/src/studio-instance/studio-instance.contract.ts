/**
 * What a running Studio tells the machine about itself, one file per process, so a controller that did not start it (the MCP server an
 * agent talks to) can find it: `~/.opencraw/studio/<pid>.json`. The token is in it, so the file is readable by its owner only.
 * `@opencraw/mcp` reads the same shape (`studio-control`); change both together.
 */
export interface StudioInstance {
  pid:       number
  /** The server's address, without the token: `http://127.0.0.1:<port>`. */
  url:       string
  token:     string
  /** The folder Studio was started with, if any; the live one is asked with `studio-status`. */
  folder?:   string
  startedAt: string
}
