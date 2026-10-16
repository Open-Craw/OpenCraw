import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * A running Studio, as it announced itself in `~/.opencraw/studio/<pid>-<port>.json` (`@opencraw/studio`'s
 * `studio-instance`; this is the same shape, change both together).
 */
export interface StudioInstance {
  pid:       number
  url:       string
  token:     string
  folder?:   string
  startedAt: string
}

/** Where running Studios announce themselves. */
export function instancesDirectory (): string {
  return join(homedir(), '.opencraw', 'studio')
}

function isAlive (pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    // EPERM: the process exists but is not ours to signal.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function instanceOf (text: string): StudioInstance | undefined {
  try {
    const value = JSON.parse(text) as Partial<StudioInstance>

    return typeof value.pid === 'number' && typeof value.url === 'string' && typeof value.token === 'string' && typeof value.startedAt === 'string'
      ? { pid: value.pid, url: value.url, token: value.token, folder: value.folder, startedAt: value.startedAt }
      : undefined
  } catch {
    return undefined
  }
}

/** The announcement files in a directory; none when it does not exist yet. */
async function namesIn (directory: string): Promise<string[]> {
  try {
    const names = await readdir(directory)

    return names.filter(file => file.endsWith('.json'))
  } catch {
    return []
  }
}

/** A file's text; empty when it vanished (its Studio just stopped). */
async function textOf (file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

/**
 * The Studios running on this machine, the newest first. A file whose process is gone (Studio was killed
 * and could not withdraw it) is left out.
 *
 * @param directory - Where Studios announce themselves.
 * @returns The live Studios.
 */
export async function runningStudios (directory: string = instancesDirectory()): Promise<StudioInstance[]> {
  const found: StudioInstance[] = []
  const names = await namesIn(directory)
  for (const name of names) {
    const instance = instanceOf(await textOf(join(directory, name)))
    if (instance !== undefined && isAlive(instance.pid)) found.push(instance)
  }

  return found.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
