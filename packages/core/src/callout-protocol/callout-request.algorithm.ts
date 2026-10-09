import { createHash } from 'node:crypto'
import type { HookContext } from '../hooks'
import type { CalloutKind, CalloutRequest } from './callout.contract'

/** What a callout is asked: the idempotency key is a hash of all of it. */
export interface CalloutRequestParts {
  kind:     CalloutKind
  name:     string
  /** Absent when the call has no input (a `hook` step). */
  input?:   unknown
  args?:    Record<string, unknown>
  recipeId: string
  scope?:   Record<string, unknown>
}

/**
 * The request for one call. The idempotency key is a hash of what the call is (the kind, the name, the
 * recipe, the input, the arguments), not a random id, so running the same call again - a retry, or a
 * durable function replaying - sends the same key.
 *
 * @param parts - What is asked.
 * @returns The request to send.
 */
export function calloutRequest (parts: CalloutRequestParts): CalloutRequest {
  const body = {
    kind:    parts.kind,
    name:    parts.name,
    ...(parts.input !== undefined && { input: parts.input }),
    args:    parts.args ?? {},
    context: { recipeId: parts.recipeId, scope: parts.scope ?? {} },
  }
  const idempotencyKey = createHash('sha256').update(JSON.stringify(body)).digest('hex')

  return { ...body, idempotencyKey }
}

/**
 * The request for one hook call.
 *
 * @param name - The hook's name in the recipe.
 * @param input - The value so far (`undefined` for a `hook` step).
 * @param args - The recipe's arguments for the hook.
 * @param context - Where the hook runs.
 * @returns The request to send.
 */
export function hookRequest (name: string, input: unknown, args: Record<string, unknown>, context: HookContext): CalloutRequest {
  return calloutRequest({ kind: 'hook', name, input, args, recipeId: context.recipeId, scope: context.scope })
}
