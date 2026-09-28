import { cachedSnapshot, pdfBytes } from '../page-snapshot'
import type { StudioState } from './workspace.store'

/**
 * Handles `GET /api/pdf-bytes`: the raw bytes of a cached PDF snapshot, for
 * the PDF canvas's `pdf.js` to render in the browser (studio plan §3.4,
 * issue #94's 5b). Not a `studio-api` command — the other commands all
 * answer JSON, and pdf.js wants the file itself — so this is its own route,
 * read directly by `studio-http.use-case.ts` (mirrors `static-file.handler.ts`'s
 * own reach outside the command dispatch).
 *
 * @param state - The server state.
 * @param recipeId - The recipe.
 * @param path - The step path; must already have a cached PDF snapshot (call `take-snapshot` first).
 * @returns The raw PDF bytes.
 * @throws Error when `path` has no cached snapshot yet, or the snapshot's document is not a PDF.
 */
export async function handlePdfBytes (state: StudioState, recipeId: string, path: string): Promise<Uint8Array> {
  const snapshot = cachedSnapshot(state.snapshots, recipeId, path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${recipeId}" at "${path}": call take-snapshot first`)
  if (snapshot.format !== 'pdf') throw new Error(`"${recipeId}" at "${path}" is not a PDF snapshot`)

  return pdfBytes(snapshot.baseUrl)
}
