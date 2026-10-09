import { calloutLabel } from '@opencraw/core'
import type { TrustedPlugins } from './trusted-plugins.contract'

/** A hook, solver or plugin that is backed by a handler outside the process: it may be slow, and it may cost money. */
export interface RemoteCallout {
  kind:  'hook' | 'captcha' | 'access'
  name:  string
  /** What it calls (`POST https://svc/price`, `command python3 slug.py`). */
  label: string
}

/**
 * Which of what Studio was started with calls outside the process, for the bar that warns the person and
 * for the stubs a sample run may use.
 *
 * @param plugins - What Studio was started with.
 * @returns The remote hooks, solvers and plugins, hooks first, each kind sorted by name.
 */
export function remoteCallouts (plugins: TrustedPlugins): RemoteCallout[] {
  const found: RemoteCallout[] = []
  for (const [name, hook] of Object.entries(plugins.hooks)) {
    const label = calloutLabel(hook)
    if (label !== undefined) found.push({ kind: 'hook', name, label })
  }
  const solvers = plugins.captchaSolvers ?? []
  for (const solver of solvers) {
    const label = calloutLabel(solver)
    if (label !== undefined) found.push({ kind: 'captcha', name: solver.name, label })
  }
  const access = plugins.accessPlugins ?? []
  for (const plugin of access) {
    const label = calloutLabel(plugin)
    if (label !== undefined) found.push({ kind: 'access', name: plugin.name, label })
  }
  const order = { hook: 0, captcha: 1, access: 2 }

  return found.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
}
