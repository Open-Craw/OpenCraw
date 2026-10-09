import { createHash } from 'node:crypto'
import type { HookContext } from '../hooks'
import type { CalloutRequest } from './callout.contract'

/**
 * The request for one hook call. The idempotency key is a hash of what the call is (the hook, the recipe,
 * the input, the arguments), not a random id, so running the same call again - a retry, or a durable
 * function replaying - sends the same key.
 *
 * @param name - The hook's name in the recipe.
 * @param input - The value so far (`undefined` for a `hook` step).
 * @param args - The recipe's arguments for the hook.
 * @param context - Where the hook runs.
 * @returns The request to send.
 */
export function hookRequest (name: string, input: unknown, args: Record<string, unknown>, context: HookContext): CalloutRequest {
  const body = { kind: 'hook' as const, name, ...(input !== undefined && { input }), args, context: { recipeId: context.recipeId, scope: context.scope } }
  const idempotencyKey = createHash('sha256').update(JSON.stringify(body)).digest('hex')

  return { ...body, idempotencyKey }
}
