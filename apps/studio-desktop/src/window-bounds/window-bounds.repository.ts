import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { WindowBounds } from './window-bounds.contract'

/** The window's last position and size, kept in one JSON file. */
export interface WindowBoundsRepository {
  load: () => Promise<WindowBounds | undefined>
  save: (bounds: WindowBounds) => Promise<void>
}

function isBounds (value: unknown): value is WindowBounds {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const numbers = [record.x, record.y, record.width, record.height]

  return numbers.every(entry => typeof entry === 'number' && Number.isFinite(entry)) &&
    typeof record.maximized === 'boolean' && (record.width as number) > 0 && (record.height as number) > 0
}

/**
 * @param file - Where the bounds are kept (the app's user-data folder).
 * @returns A repository over that file. A missing or unreadable file means "no saved place": losing the
 *   window's position must never stop the app from starting.
 */
export function createWindowBoundsRepository (file: string): WindowBoundsRepository {
  return {
    async load () {
      try {
        const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))

        return isBounds(parsed) ? parsed : undefined
      } catch {
        return
      }
    },
    async save (bounds) {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(bounds, undefined, 2), 'utf8')
    },
  }
}
