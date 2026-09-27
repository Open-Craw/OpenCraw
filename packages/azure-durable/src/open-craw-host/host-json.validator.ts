import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What in the Function App's `host.json` would make the host misbehave. An
 * item waiting in a pool's inbox holds an activity slot, so a pool can only
 * fill its windows if Durable runs that many activities at once.
 *
 * @param maxWindows - The most windows one pool may have.
 * @param directory - Where `host.json` is; the working directory by default.
 * @returns Warnings, none when `host.json` is missing or fine.
 */
export function hostJsonWarnings (maxWindows: number, directory = process.cwd()): string[] {
  let host: { extensions?: { durableTask?: { maxConcurrentActivityFunctions?: unknown } } }
  try {
    host = JSON.parse(readFileSync(join(directory, 'host.json'), 'utf8')) as typeof host
  } catch {
    return []
  }
  const slots = host.extensions?.durableTask?.maxConcurrentActivityFunctions
  if (typeof slots !== 'number' || slots >= maxWindows + 2) return []

  return [`host.json: extensions.durableTask.maxConcurrentActivityFunctions is ${slots}, but one pool may run ${maxWindows} windows; items waiting in a pool hold activity slots, so set it to at least ${maxWindows + 2}`]
}
