import { resolve } from 'node:path'
import { startStudioServer } from './studio-server'
import type { TrustedPlugins } from './trusted-plugins'

/** What the caller of `main` decided beyond the command-line arguments. */
export interface StudioMainOptions {
  /** Hooks and plugins loaded from a file the person named at launch (`opencraw studio --hooks <file>`, issue #150). `main` never loads code itself. */
  plugins?: TrustedPlugins
}

/**
 * Runs `opencraw-studio`: starts the server, opens `folder` (if given) as
 * the workspace right away, and prints the URL with the token, the way
 * `docs/research/recipe-studio.md` §2 shows it: `http://127.0.0.1:<port>/?token=…`.
 * The process stays up (the server keeps the event loop alive) until it is
 * interrupted (Ctrl+C).
 *
 * @param argv - Arguments after the program name: an optional recipe folder, `.` when omitted.
 * @param options - What the caller loaded beforehand: the trusted plugins, if any.
 */
export async function main (argv: readonly string[], options: StudioMainOptions = {}): Promise<void> {
  const folder = resolve(argv[0] ?? '.')
  const server = await startStudioServer({ initialFolder: folder, plugins: options.plugins })
  process.stdout.write(`OpenCraw Studio: ${server.url}\n`)
  process.stdout.write(`Workspace: ${folder}\n`)
  if (options.plugins !== undefined) process.stdout.write(`Hooks: ${options.plugins.source} (runs as your code)\n`)
  const shutdown = (): void => { void server.close() }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
