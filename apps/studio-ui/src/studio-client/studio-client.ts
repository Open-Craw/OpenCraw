import type { DeckDocumentView, DeckPreviewOptions, DeckTablePreviewView, DocumentTreeView, ExplainWhyCommand, FetchStartPageCommand, GridPreviewOptions, GridTablePreviewView, InferSelectorView, InspectView, OpenWorkspaceCommand, OutlineView, PdfDocumentView, ResponsesSeenView, RunSampleCommand, SampleBudget, SaveOutlineCommand, SaveRecipeCommand, SnapshotView, StartPageView, StopRunCommand, StudioCommand, StudioEvent, TablePreviewOptions, TablePreviewView, VerifySelectorView, WhyTarget, WhyView, WorkbookDocumentView, WorkspaceView } from '@opencraw/studio'

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
  /** Explains a missing or rejected value from the recipe's last sample run (issue #92's Why? tab). */
  explainWhy:     (target: WhyTarget) => Promise<WhyView>
  /** The Inspect panel's DOM tree and data-in-the-page findings, off the same cached snapshot (issue #93). */
  inspectPage:    (recipeId: string, path: string) => Promise<InspectView>
  /** The JSON responses seen while the recipe's start page rendered (issue #93's "responses seen"); slower than `inspectPage` (opens its own browser session). */
  responsesSeen:  (recipeId: string, path: string) => Promise<ResponsesSeenView>
  /** The content pane's tree canvas for a JSON/YAML/XML snapshot (`document-view`, studio plan §3.4, issue #94's 5a), off the same cached snapshot. */
  documentTree:   (recipeId: string, path: string) => Promise<DocumentTreeView>
  /** The PDF canvas's cells and rows for a PDF snapshot (`document-view`'s `pdf-view.mapper.ts`, studio plan §3.4, issue #94's 5b), off the same cached snapshot. */
  pdfView:        (recipeId: string, path: string) => Promise<PdfDocumentView>
  /** The PDF canvas's live preview of a `table` extract's options (`document-view`'s `table-preview.use-case.ts`, issue #94's 5b): a pure computation over the cached snapshot, instant on every option change. */
  tablePreview:   (recipeId: string, path: string, options: TablePreviewOptions) => Promise<TablePreviewView>
  /** The URL the PDF canvas's `pdf.js` fetches directly for the raw bytes of a cached PDF snapshot (`GET /api/pdf-bytes`, issue #94's 5b) — not a `send`-through command, since it answers bytes, not JSON. */
  pdfBytesUrl:    (recipeId: string, path: string) => string
  /** The grid canvas's sheets and cells for a CSV/spreadsheet snapshot (`document-view`'s `workbook-view.mapper.ts`, studio plan §3.4, issue #94's 5c), off the same cached snapshot; `delimiter`/`encoding` override a CSV's auto-detected reading. */
  gridView:       (recipeId: string, path: string, override?: { delimiter?: string, encoding?: string }) => Promise<WorkbookDocumentView>
  /** The grid canvas's live preview of a `table` extract's options (`document-view`'s `previewGridTable`, issue #94's 5c): a pure computation over the cached snapshot, instant on every option change. */
  gridPreview:    (recipeId: string, path: string, options: GridPreviewOptions) => Promise<GridTablePreviewView>
  /** The deck canvas's slides, shapes, tables, charts and notes for a `.pptx` snapshot (`document-view`'s `deck-view.mapper.ts`, studio plan §3.4, issue #94's 5d), off the same cached snapshot. */
  deckView:       (recipeId: string, path: string) => Promise<DeckDocumentView>
  /** The deck canvas's live preview of a `table` extract's options (`document-view`'s `previewDeckTable`, issue #94's 5d): a pure computation over the cached snapshot, instant on every option change. */
  deckPreview:    (recipeId: string, path: string, options: DeckPreviewOptions) => Promise<DeckTablePreviewView>
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
    explainWhy:     target => send<WhyView>(token, { type: 'explain-why', target } satisfies ExplainWhyCommand),
    inspectPage:    (recipeId, path) => send<InspectView>(token, { type: 'inspect-page', recipeId, path }),
    responsesSeen:  (recipeId, path) => send<ResponsesSeenView>(token, { type: 'responses-seen', recipeId, path }),
    documentTree:   (recipeId, path) => send<DocumentTreeView>(token, { type: 'document-tree', recipeId, path }),
    pdfView:        (recipeId, path) => send<PdfDocumentView>(token, { type: 'pdf-view', recipeId, path }),
    tablePreview:   (recipeId, path, options) => send<TablePreviewView>(token, { type: 'table-preview', recipeId, path, options }),
    pdfBytesUrl:    (recipeId, path) => `/api/pdf-bytes?token=${encodeURIComponent(token)}&recipeId=${encodeURIComponent(recipeId)}&path=${encodeURIComponent(path)}`,
    gridView:       (recipeId, path, override) => send<WorkbookDocumentView>(token, { type: 'grid-view', recipeId, path, delimiter: override?.delimiter, encoding: override?.encoding }),
    gridPreview:    (recipeId, path, options) => send<GridTablePreviewView>(token, { type: 'grid-preview', recipeId, path, options }),
    deckView:       (recipeId, path) => send<DeckDocumentView>(token, { type: 'deck-view', recipeId, path }),
    deckPreview:    (recipeId, path, options) => send<DeckTablePreviewView>(token, { type: 'deck-preview', recipeId, path, options }),
    subscribe:      (onEvent) => {
      const protocol = globalThis.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${globalThis.location.host}/ws?token=${encodeURIComponent(token)}`)
      const handler = (event: MessageEvent<unknown>): void => { onEvent(JSON.parse(String(event.data)) as StudioEvent) }
      socket.addEventListener('message', handler as (event: MessageEvent) => void)

      return () => { socket.close() }
    },
  }
}
