import type { Hook } from '../hooks'
import { commandTransport } from '../callout-transport'
import type { CalloutPollingOptions, CommandTransportOptions } from '../callout-transport'
import { calloutHook } from './callout-hook.use-case'

/** Timeout, output limit, working directory (per run of the program) and how long a `pending` answer may last. */
export type CommandHookOptions = CommandTransportOptions & CalloutPollingOptions

/**
 * A hook that runs a local program in any language: the request goes to its stdin as one JSON document,
 * and it answers with one JSON document on stdout (`{"status":"ok","output":…}`). Whatever it writes to
 * stderr is logged at `debug`. An answer of `pending` runs it again, with the same request, after
 * `retryAfterMs`, until it settles or `maxWaitMs` passes. The command is an argument list, never a shell
 * string, so nothing in the request can become part of the command line. It belongs in the trusted hooks
 * module, never in a recipe.
 *
 * @param name - The hook's name in the recipe, sent in the request.
 * @param command - The program and its arguments (`['python3', 'slug.py']`).
 * @param options - Timeout, output limit, working directory and how long to wait.
 * @returns A hook to register under `name`.
 */
export function commandHook (name: string, command: readonly [string, ...string[]], options: CommandHookOptions = {}): Hook {
  return calloutHook(name, commandTransport(command, options), options)
}
