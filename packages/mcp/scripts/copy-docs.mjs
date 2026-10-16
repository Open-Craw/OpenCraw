// Copies the documentation an agent reads (the `docs` tool) into the package, so it ships with it: `docs/recipes`, `docs/how-it-works` and `docs/studio`,
// the Markdown files directly in each (their pictures and capture scripts stay behind).
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '..', '..', '..', 'docs')
const target = resolve(here, '..', 'docs')

rmSync(target, { recursive: true, force: true })
for (const folder of ['recipes', 'how-it-works', 'studio']) {
  mkdirSync(join(target, folder), { recursive: true })
  const documents = readdirSync(join(source, folder)).filter(file => file.toLowerCase().endsWith('.md'))
  for (const name of documents) cpSync(join(source, folder, name), join(target, folder, name))
}
