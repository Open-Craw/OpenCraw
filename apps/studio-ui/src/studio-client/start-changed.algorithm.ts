/**
 * Whether saving `next` over `previousText` points the recipe at another
 * document or page: what the views of the old one (snapshot, PDF cells,
 * previews) were drawn from is then stale. Unreadable text on either side
 * counts as changed, the safe answer.
 *
 * @param previousText - The recipe file as it was (the workspace listing's text), if the UI had it.
 * @param next - The recipe about to be, or just, saved.
 */
export function startChanged (previousText: string | undefined, next: unknown): boolean {
  if (previousText === undefined) return true
  try {
    const previous = (JSON.parse(previousText) as { start?: unknown }).start

    return JSON.stringify(previous) !== JSON.stringify((next as { start?: unknown }).start)
  } catch {
    return true
  }
}
