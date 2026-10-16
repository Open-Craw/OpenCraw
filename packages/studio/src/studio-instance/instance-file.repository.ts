import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { StudioInstance } from './studio-instance.contract'

/** The announcement's file: one per process and port, so two Studios in one process do not share it. */
function fileOf (instance: Pick<StudioInstance, 'pid' | 'url'>, directory: string): string {
  return join(directory, `${String(instance.pid)}-${new URL(instance.url).port}.json`)
}

/** Where running Studios announce themselves, unless the caller says otherwise. */
export function defaultInstancesDirectory (): string {
  return join(homedir(), '.opencraw', 'studio')
}

/**
 * Writes the file that tells controllers this Studio is running. Failing to write it never stops Studio: it only means no agent can find it.
 *
 * @param instance - What to announce.
 * @param directory - Where announcements live.
 * @returns Whether the file was written.
 */
export async function announceInstance (instance: StudioInstance, directory: string): Promise<boolean> {
  try {
    await mkdir(directory, { recursive: true })
    const file = fileOf(instance, directory)
    await writeFile(file, JSON.stringify(instance), { mode: 0o600 })
    await chmod(file, 0o600)

    return true
  } catch {
    return false
  }
}

/** Removes the announcement, when Studio stops. */
export async function withdrawInstance (instance: Pick<StudioInstance, 'pid' | 'url'>, directory: string): Promise<void> {
  await rm(fileOf(instance, directory), { force: true })
}
