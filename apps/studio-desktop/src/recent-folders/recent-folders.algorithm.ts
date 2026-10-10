/** How many folders the Open Recent menu keeps. */
export const RECENT_FOLDER_LIMIT = 10

/**
 * @param recent - The remembered folders, most recent first.
 * @param folder - The folder that was just opened.
 * @param limit - How many to keep.
 * @returns The list with `folder` first, no duplicate of it, cut to `limit`.
 */
export function rememberFolder (recent: readonly string[], folder: string, limit: number = RECENT_FOLDER_LIMIT): string[] {
  return [folder, ...recent.filter(entry => entry !== folder)].slice(0, limit)
}

/**
 * @param recent - The remembered folders, most recent first.
 * @param folder - A folder that is gone or was removed from the list.
 * @returns The list without `folder`.
 */
export function forgetFolder (recent: readonly string[], folder: string): string[] {
  return recent.filter(entry => entry !== folder)
}
