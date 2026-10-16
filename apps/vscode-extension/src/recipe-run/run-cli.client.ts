import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** What a run of the command line came to. */
export interface CliResult {
  /** The exit code; `null` when it was stopped before it ended. */
  code:      number | null
  /** Everything it wrote to its error output: the crawl's summary and its errors. */
  stderr:    string
  cancelled: boolean
}

export interface CliOptions {
  /** Called with each piece of error output as it arrives. */
  onOutput?: (chunk: string) => void
  /** Aborting stops the process. */
  signal?:   AbortSignal
}

/**
 * The command line program the extension carries: in the installed extension it sits in `node_modules`, in a checkout of the repository beside the
 * app.
 *
 * @param extensionPath - Where the extension is installed.
 * @returns The script to run.
 * @throws Error when it is in neither place.
 */
export function cliScript (extensionPath: string): string {
  const candidates = [
    join(extensionPath, 'node_modules', '@opencraw', 'cli', 'bin', 'opencraw.mjs'),
    join(extensionPath, '..', '..', 'packages', 'cli', 'bin', 'opencraw.mjs'),
  ]
  const found = candidates.find(candidate => existsSync(candidate))
  if (found === undefined) throw new Error('the OpenCraw command line program is missing from this installation: reinstall the extension')

  return found
}

/**
 * Runs the command line with the editor's own executable as plain Node (`ELECTRON_RUN_AS_NODE`, as the Studio process does), so the extension ships no
 * Node and the editor never waits on a crawl.
 *
 * @param script - The program.
 * @param args - Its arguments.
 * @param options - Output listener and cancellation.
 * @returns How it ended.
 */
export async function runCli (script: string, args: readonly string[], options: CliOptions = {}): Promise<CliResult> {
  return await new Promise((resolve, reject) => {
    const child = fork(script, [...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let stderr = ''
    let cancelled = false
    const stop = (): void => {
      cancelled = true
      child.kill()
    }
    child.stderr?.on('data', (chunk: Uint8Array | string) => {
      const text = String(chunk)
      stderr += text
      options.onOutput?.(text)
    })
    options.signal?.addEventListener('abort', stop, { once: true })
    if (options.signal?.aborted === true) stop()
    child.on('error', reject)
    child.on('exit', (code) => {
      options.signal?.removeEventListener('abort', stop)
      resolve({ code, stderr, cancelled })
    })
  })
}
