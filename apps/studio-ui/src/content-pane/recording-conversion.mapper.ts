import type { OutlineCard } from '@opencraw/studio'

/** One recorded step's raw JSON, exactly as `stop-recording`/`recording-stopped` hand it back (`flow-recording`'s own `RecorderSessionHandle.stop`'s `{ steps }`). */
export type RecordedStep = Record<string, unknown>

/**
 * A `goto` card back to the recording's own start point (issue #95's "the
 * window's own start point restored first"): neither a fresh
 * `session.bootstrap` run nor an appended `steps` list navigates there on
 * its own the way the recording window's own `page.goto` did — the recorder
 * only ever reports the person's *own* actions, never that first navigation.
 *
 * @param url - The URL the recording window opened on (`recording.store.ts`'s `startUrl`).
 * @param path - This node's outline path.
 * @returns The outline card, ready to insert with `save-outline`.
 */
export function gotoCardNode (url: string, path: string): OutlineCard {
  return { kind: 'card', path, stepType: 'goto', sentence: [{ kind: 'word', text: 'Go to' }, { kind: 'code', text: url }], custom: false, step: { type: 'goto', url } }
}

/**
 * "Make this the login"'s own `session.bootstrap.steps` (issue #95): the
 * window's own start point, restored by a `goto` (see `gotoCardNode`'s own
 * doc comment for why), then every step recorded, in order.
 *
 * @param startUrl - The recording's own start point.
 * @param recordedSteps - Every step recorded, in order (`recording-stopped`'s `steps`).
 * @returns The bootstrap's own step list, raw JSON, ready to sit under `session.bootstrap.steps`.
 */
export function bootstrapStepsFor (startUrl: string, recordedSteps: readonly RecordedStep[]): RecordedStep[] {
  return [{ type: 'goto', url: startUrl }, ...recordedSteps]
}

/**
 * "Make this the login"'s full `session.bootstrap` suggestion (issue #95:
 * "turns the recorded run into `session.bootstrap` with `storageStatePath`
 * suggested"): `keep: ['cookies']` (never `localStorage`, which could carry
 * more than the session needs — the same choice `recording.e2e.test.ts`'s
 * own golden recipe makes) and a suggested `saveTo`
 * (`suggestedStorageStatePath`). Any bootstrap fields the recipe already had
 * besides `steps`/`keep`/`saveTo` (a hook, say) are kept.
 *
 * @param startUrl - The recording's own start point.
 * @param recordedSteps - Every step recorded, in order.
 * @param existingBootstrap - The recipe's own `session.bootstrap`, if it already had one.
 * @param saveTo - The suggested `storageStatePath` (`suggestedStorageStatePath`).
 * @returns The `session.bootstrap` value to write.
 */
export function suggestedBootstrap (
  startUrl: string,
  recordedSteps: readonly RecordedStep[],
  existingBootstrap: Record<string, unknown> | undefined,
  saveTo: string,
): Record<string, unknown> {
  return { ...existingBootstrap, steps: bootstrapStepsFor(startUrl, recordedSteps), keep: ['cookies'], saveTo }
}

/**
 * A `storageStatePath` suggestion for "make this the login" (issue #95):
 * `storage/<recipeId>-session.json`, next to the recipe file itself, so
 * saving the outline needs no directory the workspace does not already have
 * a natural place for. `path`-module-free (plain string ops): this runs in
 * the browser bundle, which does not carry Node's `path`.
 *
 * @param recipeFile - The recipe's own file path (`RecipeListing.file`).
 * @param recipeId - The recipe's own id.
 * @returns The suggested path, in the recipe file's own directory and its own slash style.
 */
/**
 * The recipe's own first start point (`start[0].url`) — the same URL
 * `handleStartRecording` opens the headed window on server-side. Reads
 * `outline.recipe` (already the recipe's plain, un-narrowed top-level JSON —
 * see `scope-outline/recipe-to-outline.mapper.ts`) rather than a validated
 * `InputRecipe` type, since a recipe mid-edit may not fully validate yet.
 *
 * @param recipe - The recipe's own top-level JSON (`RecipeListing.outline.recipe`).
 * @returns The start URL, or `undefined` when `start` is missing, empty, or shaped unexpectedly.
 */
export function recipeStartUrl (recipe: Record<string, unknown>): string | undefined {
  const start = recipe.start
  if (!Array.isArray(start)) return undefined
  const first: unknown = start[0]
  if (typeof first !== 'object' || first === null) return undefined
  const url = (first as Record<string, unknown>).url

  return typeof url === 'string' ? url : undefined
}

export function suggestedStorageStatePath (recipeFile: string, recipeId: string): string {
  const lastSlash = Math.max(recipeFile.lastIndexOf('/'), recipeFile.lastIndexOf('\\'))
  const dir = lastSlash === -1 ? '.' : recipeFile.slice(0, lastSlash)
  const sep = lastSlash === -1 || recipeFile[lastSlash] === undefined ? '/' : recipeFile[lastSlash]

  return `${dir}${sep}storage${sep}${recipeId}-session.json`
}
