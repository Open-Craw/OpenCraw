import type { WindowsPolicy } from '@opencraw/core'

/**
 * A job's windows, within the host's limit and never more than the job has
 * items: twelve windows for three items would only sit idle.
 *
 * @param policy - What the job asked for.
 * @param maxWindows - The host's limit.
 * @param jobSize - About how many items the job has.
 * @returns The policy, capped.
 */
export function capWindows (policy: WindowsPolicy | number, maxWindows: number, jobSize?: number): WindowsPolicy {
  const asked: WindowsPolicy = typeof policy === 'number' ? { min: policy } : policy
  const cap = Math.max(1, Math.min(maxWindows, jobSize ?? maxWindows))
  const max = Math.min(asked.max ?? asked.min ?? 1, cap)
  const min = Math.min(asked.min ?? 1, max)
  const start = Math.min(Math.max(asked.start ?? min, min), max)

  return { ...asked, min, max, start }
}
