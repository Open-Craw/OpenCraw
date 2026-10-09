import { calloutLabel } from '@opencraw/core'
import type { HookMap } from '@opencraw/core'

/**
 * The hooks a sample run uses: the ones Studio was started with, except that
 *
 * - a hook the person stubbed returns the stub's value and calls nothing, and
 * - a hook that calls outside the process says so in the trace, once per call, because it may be slow
 *   and it may cost money.
 *
 * @param hooks - The hooks Studio was started with.
 * @param stubs - Values to answer with instead of calling a hook, by hook name. A name that is not a hook is ignored.
 * @param announce - Where the trace lines go.
 * @returns The hooks to run the sample with.
 */
export function calloutHooks (hooks: HookMap | undefined, stubs: Record<string, unknown> | undefined, announce: (line: string) => void): HookMap | undefined {
  if (hooks === undefined) return undefined
  const prepared: HookMap = {}
  for (const [name, hook] of Object.entries(hooks)) {
    if (stubs !== undefined && Object.hasOwn(stubs, name)) {
      const stub = stubs[name]
      prepared[name] = () => {
        announce(`☎ hook "${name}" is stubbed: answering ${JSON.stringify(stub) ?? 'undefined'} without calling it`)

        return stub
      }
      continue
    }
    const label = calloutLabel(hook)
    prepared[name] = label === undefined
      ? hook
      : async (input, args, context) => {
        announce(`☎ hook "${name}" calls ${label} (slow, and it may cost: stub it to skip the call)`)

        return await hook(input, args, context)
      }
  }

  return prepared
}
