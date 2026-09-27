// Every scene of the guide: one module per page in ./scenes, each exporting SCENES.
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const folder = join(dirname(fileURLToPath(import.meta.url)), 'scenes')
const files = await readdir(folder)
const modules = await Promise.all(files.filter(file => file.endsWith('.mjs')).toSorted((a, b) => a.localeCompare(b)).map(file => import(pathToFileURL(join(folder, file)).href)))

export const SCENES = modules.flatMap(module => module.SCENES)
