import type { Terminal } from '../terminal'

/** The one export the cli needs from `@opencraw/studio`. */
export interface StudioModule {
  main: (argv: readonly string[]) => Promise<void>
}

/**
 * Runs `opencraw studio [folder]`: imports `@opencraw/studio` lazily and
 * delegates to its own `main`, which starts the server, prints the URL with
 * the token, and keeps running until interrupted (Ctrl+C) — the cli's own
 * call does not return before that. `@opencraw/studio` is an optional peer
 * dependency (`peerDependenciesMeta`), never a hard one: the cli stays light
 * for callers who only need to crawl. When it is not installed, this prints
 * how to add it instead of letting a raw `ERR_MODULE_NOT_FOUND` stack trace
 * through.
 *
 * @param folder - The recipe folder to open; `@opencraw/studio`'s own default (the current directory) when omitted.
 * @param terminal - Where output goes.
 * @param importStudio - How the module is loaded; the real dynamic `import()` by default, replaced in tests.
 * @returns The exit code: 0 once the server has stopped, 1 when `@opencraw/studio` is missing.
 */
export async function runStudio (folder: string | undefined, terminal: Terminal, importStudio: () => Promise<StudioModule> = () => import('@opencraw/studio')): Promise<number> {
  let studio: StudioModule
  try {
    studio = await importStudio()
  } catch (error) {
    if (!isModuleNotFound(error)) throw error
    terminal.err('the studio is not installed: run `npm install @opencraw/studio`, then try again')

    return 1
  }
  await studio.main(folder === undefined ? [] : [folder])

  return 0
}

function isModuleNotFound (error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'ERR_MODULE_NOT_FOUND'
}
