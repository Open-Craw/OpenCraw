/** What reaches outside the process, by the object that does it: a hook function, a solver, a plugin. */
const labels = new WeakMap<object, string>()

/**
 * Remembers that `value` (a hook, a captcha solver, an access plugin) is backed by a handler outside the
 * process, so a tool can tell its person that a call may be slow or paid.
 *
 * @param value - The hook, solver or plugin.
 * @param label - What it calls (`POST https://svc/price`, `command python3 slug.py`).
 * @returns `value`, unchanged.
 */
export function markCallout<T extends object> (value: T, label: string): T {
  labels.set(value, label)

  return value
}

/**
 * @param value - A hook, solver or plugin.
 * @returns What it calls, when `markCallout` marked it; `undefined` for code that runs in the process.
 */
export function calloutLabel (value: object): string | undefined {
  return labels.get(value)
}
