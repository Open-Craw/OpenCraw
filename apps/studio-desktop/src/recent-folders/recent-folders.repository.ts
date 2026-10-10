import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** The recipe folders the person opened, most recent first, kept in one JSON file. */
export interface RecentFoldersRepository {
  load: () => Promise<string[]>
  save: (folders: readonly string[]) => Promise<void>
}

/**
 * @param file - Where the list is kept (the app's user-data folder).
 * @returns A repository over that file. A missing or unreadable file is an empty list: losing the
 *   recent list must never stop the app from starting.
 */
export function createRecentFoldersRepository (file: string): RecentFoldersRepository {
  return {
    async load () {
      try {
        const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))

        return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
      } catch {
        return []
      }
    },
    async save (folders) {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(folders, undefined, 2), 'utf8')
    },
  }
}
