import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { titleOf, topicIdOf } from './docs-topics.algorithm'

/** One document the server can show. */
export interface DocTopic {
  id:    string
  title: string
  /** Its size in characters, so an agent knows to ask for a section of a long one. */
  size:  number
}

/** The folders under the docs folder whose Markdown files are documentation for a person (or an agent) using OpenCraw. */
const FOLDERS = ['recipes', 'how-it-works', 'studio']

/**
 * The documents under a docs folder: the Markdown files directly inside `recipes`, `how-it-works` and `studio` (their pictures and capture scripts are
 * not documentation to read).
 *
 * @param root - The docs folder.
 * @returns The topics, ordered by id.
 */
export async function listTopics (root: string): Promise<DocTopic[]> {
  const topics: DocTopic[] = []
  for (const folder of FOLDERS) {
    let names: string[]
    try {
      names = await readdir(join(root, folder))
    } catch {
      continue
    }
    const documents = names.filter(file => file.toLowerCase().endsWith('.md'))
    for (const name of documents) {
      const id = topicIdOf(`${folder}/${name}`)
      const text = await readFile(join(root, folder, name), 'utf8')
      topics.push({ id, title: titleOf(text, id), size: text.length })
    }
  }

  return topics.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * One document's text.
 *
 * @param root - The docs folder.
 * @param id - The topic id from `listTopics` (never a path: nothing outside the listed folders is read).
 * @returns The Markdown, or `undefined` when there is no such topic.
 */
export async function readTopic (root: string, id: string): Promise<string | undefined> {
  const known = await listTopics(root)
  if (known.every(topic => topic.id !== id)) return undefined

  return await readFile(join(root, `${id}.md`), 'utf8')
}
