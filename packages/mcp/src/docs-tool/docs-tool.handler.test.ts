import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { docsTool } from './docs-tool.handler'
import { outlineOf, sectionOf, titleOf, topicIdOf } from './docs-topics.algorithm'

const AUTHORING = `# Authoring guide

Intro text.

## 1. Recipes

About recipes.

### 1.1 Input

An input recipe.

\`\`\`sh
# not a heading
\`\`\`

## 2. Selectors

About selectors.
`

async function docsFolder (long = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mcp-docs-'))
  await mkdir(join(root, 'recipes'))
  await mkdir(join(root, 'studio'))
  await mkdir(join(root, 'capture'))
  await writeFile(join(root, 'recipes', 'authoring.md'), long ? `${AUTHORING}\n${'x'.repeat(40_000)}` : AUTHORING)
  await writeFile(join(root, 'studio', 'manual.md'), '# Studio manual\n\nClick.\n')
  await writeFile(join(root, 'capture', 'script.md'), '# not documentation\n')

  return root
}

function body (result: CallToolResult): Record<string, unknown> {
  const first = result.content[0] as { text: string }

  return JSON.parse(first.text) as Record<string, unknown>
}

describe('docs-topics', () => {
  it('names a topic by its path under the docs folder, and its title by its first heading', () => {
    expect(topicIdOf(String.raw`recipes\authoring.md`)).toBe('recipes/authoring')
    expect(titleOf(AUTHORING, 'x')).toBe('Authoring guide')
    expect(titleOf('no heading', 'fallback')).toBe('fallback')
  })

  it('lists the headings and ignores a # inside a code fence', () => {
    expect(outlineOf(AUTHORING).map(heading => `${String(heading.level)} ${heading.text}`)).toEqual(['1 Authoring guide', '2 1. Recipes', '3 1.1 Input', '2 2. Selectors'])
  })

  it('takes a section with its subsections up to the next heading of its level, by exact or partial heading', () => {
    expect(sectionOf(AUTHORING, '1. Recipes')).toContain('1.1 Input')
    expect(sectionOf(AUTHORING, '1. Recipes')).not.toContain('About selectors')
    expect(sectionOf(AUTHORING, 'selectors')).toContain('About selectors')
    expect(sectionOf(AUTHORING, 'nothing like it')).toBeUndefined()
  })
})

describe('docsTool', () => {
  it('lists the documents of the docs folders, not what sits in other folders', async () => {
    const result = body(await docsTool({}, await docsFolder()))

    expect((result.topics as { id: string, title: string }[]).map(topic => [topic.id, topic.title])).toEqual([['recipes/authoring', 'Authoring guide'], ['studio/manual', 'Studio manual']])
  })

  it('gives a short document whole, and a section of it when asked', async () => {
    const root = await docsFolder()

    expect(body(await docsTool({ topic: 'studio/manual' }, root)).text).toContain('Click.')
    expect(body(await docsTool({ topic: 'recipes/authoring', section: 'selectors' }, root)).text).toContain('## 2. Selectors')
  })

  it('answers a long document with its outline until a section is asked for', async () => {
    const result = body(await docsTool({ topic: 'recipes/authoring' }, await docsFolder(true)))

    expect(result.text).toBeUndefined()
    expect(result.outline).toContain('## 2. Selectors')
    expect(String(result.note)).toContain('ask for a section')
  })

  it('says what is wrong for an unknown topic or heading, with what to try', async () => {
    const root = await docsFolder()
    const unknown = await docsTool({ topic: 'authoring' }, root)
    const wrongHeading = await docsTool({ topic: 'recipes/authoring', section: 'zzz' }, root)

    expect(unknown.isError).toBe(true)
    expect((unknown.content[0] as { text: string }).text).toContain('recipes/authoring')
    expect(wrongHeading.isError).toBe(true)
    expect(body(wrongHeading).outline).toContain('## 1. Recipes')
  })

  it('never reads outside the listed folders: a path is not a topic', async () => {
    const result = await docsTool({ topic: '../../etc/passwd' }, await docsFolder())

    expect(result.isError).toBe(true)
  })

  it('says so when no documentation is installed', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'mcp-docs-empty-'))
    const result = await docsTool({}, empty)

    expect(result.isError).toBe(true)
  })
})
