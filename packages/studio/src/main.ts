import { resolve } from 'node:path'
import { startStudioServer } from './studio-server'

/**
 * Runs `opencraw-studio`: starts the server, opens `folder` (if given) as
 * the workspace right away, and prints the URL with the token, the way
 * `docs/research/recipe-studio.md` §2 shows it: `http://127.0.0.1:<port>/?token=…`.
 * The process stays up (the server keeps the event loop alive) until it is
 * interrupted (Ctrl+C).
 *
 * @param argv - Arguments after the program name: an optional recipe folder, `.` when omitted.
 */
export async function main (argv: readonly string[]): Promise<void> {
  const folder = resolve(argv[0] ?? '.')
  const server = await startStudioServer({ initialFolder: folder })
  process.stdout.write(`OpenCraw Studio: ${server.url}\n`)
  process.stdout.write(`Workspace: ${folder}\n`)
  const shutdown = (): void => { void server.close() }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
