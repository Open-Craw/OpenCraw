import { spawn } from 'node:child_process'
import type { Hook } from '../hooks'
import { hookRequest } from './callout-request.algorithm'
import { settleCallout } from './callout-polling.use-case'
import type { CalloutPollingOptions } from './callout-polling.use-case'
import { answerOf, parseAnswer } from './callout-response.algorithm'
import type { CalloutResponse } from './callout.contract'
import { CalloutError } from './callout.error'

export interface CommandHookOptions extends CalloutPollingOptions {
  /** Milliseconds before one run of the process is killed. Default 30000. */
  timeoutMs?:      number
  /** Bytes of output kept before the call fails. Default 10 MiB. */
  maxOutputBytes?: number
  /** Working directory of the process. Default: the current one. */
  cwd?:            string
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024

/**
 * A hook that runs a local program in any language: the request goes to its stdin as one JSON document,
 * and it answers with one JSON document on stdout (`{"status":"ok","output":…}`). Whatever it writes to
 * stderr is logged at `debug`. An answer of `pending` runs it again, with the same request, after
 * `retryAfterMs`, until it settles or `maxWaitMs` passes. The command is an argument list, never a shell string, so nothing in the
 * request can become part of the command line. It belongs in the trusted hooks module, never in a recipe.
 *
 * @param name - The hook's name in the recipe, sent in the request.
 * @param command - The program and its arguments (`['python3', 'slug.py']`).
 * @param options - Timeout, output limit and working directory.
 * @returns A hook to register under `name`.
 */
export function commandHook (name: string, command: readonly [string, ...string[]], options: CommandHookOptions = {}): Hook {
  const label = `command ${command.join(' ')}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES

  return async (input, args, context) => {
    const request = hookRequest(name, input, args, context)
    const attempt = async (): Promise<CalloutResponse> => {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(command[0], command.slice(1), { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
        const chunks: Buffer[] = []
        let size = 0
        let stderr = ''
        let tail = ''
        let settled = false
        const fail = (reason: string): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          child.kill()
          reject(new CalloutError(label, reason))
        }
        const timer = setTimeout(() => { fail(`no answer within ${String(timeoutMs)} ms`) }, timeoutMs)

        child.stdout.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > limit) fail(`more than ${String(limit)} bytes of output`)
          else chunks.push(chunk)
        })
        child.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf8')
          tail = (tail + text).slice(-300)
          stderr += text
          const lines = stderr.split('\n')
          stderr = lines.pop() ?? ''
          for (const line of lines) if (line.trim() !== '') context.log('debug', line)
        })
        child.on('error', (error) => { fail(error.message) })
        child.on('close', (code) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (code === 0) {
            if (stderr.trim() !== '') context.log('debug', stderr.trim())
            resolve(Buffer.concat(chunks).toString('utf8'))
          } else {
            reject(new CalloutError(label, `exited with code ${String(code)}${tail.trim() === '' ? '' : `: ${tail.trim()}`}`))
          }
        })
        // A program that exits without reading its input closes the pipe: its exit code says why.
        child.stdin.on('error', () => {})
        child.stdin.end(JSON.stringify(request))
      })

      return answerOf(label, parseAnswer(label, stdout))
    }

    return settleCallout(label, attempt, options)
  }
}
