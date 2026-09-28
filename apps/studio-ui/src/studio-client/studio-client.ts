import type { FetchStartPageCommand, InferSelectorView, OpenWorkspaceCommand, OutlineView, RunSampleCommand, SampleBudget, SaveOutlineCommand, SaveRecipeCommand, SnapshotView, StartPageView, StopRunCommand, StudioCommand, StudioEvent, VerifySelectorView, WorkspaceView } from '@opencraw/studio'

/** The api client and the WebSocket, typed by `@opencraw/studio`'s `studio-api` (type-only: no server code ships to the browser). */
export interface StudioClient {
  /** The token every request needs; read once from the page's own URL. */
  token:          string
  /** The folder `opencraw-studio` was started with, if the URL carries one. */
  initialFolder?: string
  openWorkspace:  (folder: string) => Promise<WorkspaceView>
  runSample:      (recipeId: string, budget?: SampleBudget) => Promise<void>
  stopRun:        () => Promise<void>
  saveRecipe:     (path: string, recipe: unknown) => Promise<void>
  saveOutline:    (path: string, outline: OutlineView) => Promise<void>
  fetchStartPage: (recipeId: string) => Promise<string>
  /** The content pane's snapshot for one recipe and step path (studio plan §3.1, issue #91), cached server-side. */
  takeSnapshot:   (recipeId: string, path: string) => Promise<SnapshotView>
  /** Runs a candidate selector through the engine's own matching against the snapshot and, best-effort, the live page. */
  verifySelector: (recipeId: string, path: string, selector: string) => Promise<VerifySelectorView>
  /** Turns one or two picked nodes' `data-oc-node` ids into a verified selector (a `Read` card's field, or the safe item+field list shape). */
  inferSelector:  (recipeId: string, path: string, nodeIds: [string] | [string, string]) => Promise<InferSelectorView>
  /** Streams every server event to `onEvent` until the returned function closes the socket. */
  subscribe:      (onEvent: (event: StudioEvent) => void) => () => void
}

function queryParam (name: string): string | undefined {
  return new URLSearchParams(globalThis.location.search).get(name) ?? undefined
}

async function send<T> (token: string, command: StudioCommand): Promise<T> {
  const response = await fetch(`/api/command?token=${encodeURIComponent(token)}`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(command),
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(errorMessage(body, response.status))

  return body as T
}

function errorMessage (body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body) return String((body).error)

  return `request failed: ${status}`
}

/**
 * Creates the studio's client: `token` and `initialFolder` come from the
 * page's own URL (`?token=…&folder=…`, printed by `opencraw-studio` and set
 * on the served page), commands go over `POST /api/command`, and events
 * stream over `GET /ws`.
 *
 * @returns The client.
 */
export function createStudioClient (): StudioClient {
  const token = queryParam('token') ?? ''
  const initialFolder = queryParam('folder')

  return {
    token,
    initialFolder,
    openWorkspace:  folder => send<WorkspaceView>(token, { type: 'open-workspace', folder } satisfies OpenWorkspaceCommand),
    runSample:      async (recipeId, budget) => { await send(token, { type: 'run-sample', recipeId, budget } satisfies RunSampleCommand) },
    stopRun:        async () => { await send(token, { type: 'stop-run' } satisfies StopRunCommand) },
    saveRecipe:     async (path, recipe) => { await send(token, { type: 'save-recipe', path, recipe: recipe as Record<string, unknown> } satisfies SaveRecipeCommand) },
    saveOutline:    async (path, outline) => { await send(token, { type: 'save-outline', path, outline } satisfies SaveOutlineCommand) },
    fetchStartPage: async (recipeId) => {
      const view = await send<StartPageView>(token, { type: 'fetch-start-page', recipeId } satisfies FetchStartPageCommand)

      return view.html
    },
    takeSnapshot:   (recipeId, path) => send<SnapshotView>(token, { type: 'take-snapshot', recipeId, path }),
    verifySelector: (recipeId, path, selector) => send<VerifySelectorView>(token, { type: 'verify-selector', recipeId, path, selector }),
    inferSelector:  (recipeId, path, nodeIds) => send<InferSelectorView>(token, { type: 'infer-selector', recipeId, path, nodeIds }),
    subscribe:      (onEvent) => {
      const protocol = globalThis.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${globalThis.location.host}/ws?token=${encodeURIComponent(token)}`)
      const handler = (event: MessageEvent<unknown>): void => { onEvent(JSON.parse(String(event.data)) as StudioEvent) }
      socket.addEventListener('message', handler as (event: MessageEvent) => void)

      return () => { socket.close() }
    },
  }
}
