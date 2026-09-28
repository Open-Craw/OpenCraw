import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import type { Duplex } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { studioCommandSchema } from '../studio-api'
import type { StudioCommand } from '../studio-api'
import { generateToken, isAuthorized, TOKEN_COOKIE } from './access-token.policy'
import { handleFetchStartPage } from './fetch-start-page.handler'
import { handleOpenWorkspace } from './open-workspace.handler'
import { handleRunSample, handleStopRun } from './run-sample.handler'
import { handleSaveOutline } from './save-outline.handler'
import { handleSaveRecipe } from './save-recipe.handler'
import { serveStatic } from './static-file.handler'
import { acceptWebSocket } from './websocket.client'
import { createStudioState } from './workspace.store'
import type { StudioState } from './workspace.store'

/** Where the UI Vite builds into, relative to this package: `dist/ui` next to the bundled server. */
function defaultUiRoot (): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'ui')
}

export interface StudioServerOptions {
  /** Where the built UI lives; default: `dist/ui` next to the running server code. */
  uiRoot?:        string
  /** A fixed port; default: an OS-assigned free port. */
  port?:          number
  /**
   * The folder `opencraw-studio` was started with, if any: set as the
   * server's current workspace right away, so `run-sample`, `save-recipe`
   * and `fetch-start-page` work immediately, before the UI's own
   * `open-workspace` call (which it still makes, to get the recipe listing;
   * the folder reaches it through the URL's `folder` query param).
   */
  initialFolder?: string
}

/** The running server: its URL (token included, ready to open), the token alone, and how to stop it. */
export interface StudioServer {
  url:   string
  token: string
  close: () => Promise<void>
}

/**
 * Starts the studio's HTTP server: one `POST /api/command` for every
 * command `studio-api` defines, `GET /ws` for the event stream, and the
 * built UI for everything else. Binds `127.0.0.1` only; every request needs
 * the token (`access-token.policy.ts`) — as a header, a query param, or the
 * cookie the server sets once a document request proves the query param.
 *
 * @param options - The UI root and the port; both default sensibly.
 * @returns The running server.
 */
export async function startStudioServer (options: StudioServerOptions = {}): Promise<StudioServer> {
  const token = generateToken()
  const uiRoot = options.uiRoot ?? defaultUiRoot()
  const state = createStudioState()
  if (options.initialFolder !== undefined) state.folder = options.initialFolder
  const server = createServer((request, response) => { void handleRequest(request, response, token, state, uiRoot) })
  server.on('upgrade', (request, socket) => { handleUpgrade(request, socket, token, state) })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const folderParam = options.initialFolder === undefined ? '' : `&folder=${encodeURIComponent(options.initialFolder)}`

  return {
    url:   `http://127.0.0.1:${port}/?token=${token}${folderParam}`,
    token,
    close: () => stop(server, state),
  }
}

async function stop (server: Server, state: StudioState): Promise<void> {
  await state.activeRun?.stop()
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => { server.close(error => (error === undefined ? resolve() : reject(error))) })
}

async function handleRequest (request: IncomingMessage, response: ServerResponse, token: string, state: StudioState, uiRoot: string): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (!isAuthorized(token, request, url.searchParams)) {
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'missing or invalid token' }))

    return
  }
  if (url.pathname === '/api/command' && request.method === 'POST') {
    await handleCommand(request, response, state)

    return
  }
  if (url.pathname === '/' && url.searchParams.get('token') !== null) response.setHeader('set-cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`)
  serveStatic(uiRoot, url.pathname, response)
}

async function handleCommand (request: IncomingMessage, response: ServerResponse, state: StudioState): Promise<void> {
  let command: StudioCommand
  try {
    const body: unknown = JSON.parse(await bodyOf(request))
    const parsed = studioCommandSchema.safeParse(body)
    if (!parsed.success) {
      respondJson(response, 400, { error: parsed.error.message })

      return
    }
    command = parsed.data
  } catch (error) {
    respondJson(response, 400, { error: error instanceof Error ? error.message : String(error) })

    return
  }
  try {
    respondJson(response, 200, await dispatch(command, state))
  } catch (error) {
    respondJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

function dispatch (command: StudioCommand, state: StudioState): Promise<unknown> {
  switch (command.type) {
    case 'open-workspace': { return handleOpenWorkspace(state, command)
    }
    case 'run-sample': { return handleRunSample(state, command)
    }
    case 'stop-run': { return handleStopRun(state, command)
    }
    case 'save-recipe': { return handleSaveRecipe(state, command)
    }
    case 'fetch-start-page': { return handleFetchStartPage(state, command)
    }
    case 'save-outline': { return handleSaveOutline(state, command)
    }
  }
}

function respondJson (response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function bodyOf (request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => { resolve(body) })
    request.on('error', reject)
  })
}

function handleUpgrade (request: IncomingMessage, socket: Duplex, token: string, state: StudioState): void {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== '/ws' || !isAuthorized(token, request, url.searchParams)) {
    socket.destroy()

    return
  }
  const connection = acceptWebSocket(request, socket)
  state.sockets.add(connection)
  connection.onClose(() => { state.sockets.delete(connection) })
}
