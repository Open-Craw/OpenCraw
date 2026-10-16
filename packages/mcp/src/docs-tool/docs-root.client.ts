import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where the documentation is: a `docs` folder beside `dist` in the installed package (copied there at build), or the repository's own `docs` when the server runs
 * from a checkout.
 *
 * @returns The docs folder.
 */
export function docsRoot (): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [join(here, '..', 'docs'), join(here, '..', '..', '..', 'docs')]

  return candidates.find(candidate => existsSync(join(candidate, 'recipes'))) ?? candidates[0]
}
