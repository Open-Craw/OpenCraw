import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { listTopics, readTopic } from './docs-folder.repository'
import { outlineOf, sectionOf } from './docs-topics.algorithm'

/** Input schema for the `docs` tool. */
export const docsInputShape = {
  topic:   z.string().optional().describe('A document id from the list this tool returns without a topic (`recipes/authoring`, `how-it-works/06-documents`, `studio/manual`…). Leave out to list every document.'),
  section: z.string().optional().describe('A heading (or part of one) of that document: only that section comes back, subsections included. A long document answers with its outline until you ask for a section.'),
}

/** A document longer than this many characters comes back as its outline, and the section asked for. */
const WHOLE_DOCUMENT_LIMIT = 30_000

function text (value: unknown, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], ...(isError && { isError }), ...(typeof value === 'object' && value !== null && { structuredContent: value as Record<string, unknown> }) }
}

/**
 * The `docs` tool: OpenCraw's own documentation, for an agent that has to write recipes right: the authoring guide (every step, selector, transform
 * and policy), how it all works, the examples and the Studio manual. Without a topic it lists what there is; with one it gives the document, or just
 * the section asked for, so a long guide costs only what is read.
 *
 * @param args - The tool's parsed input.
 * @param root - The docs folder (the packaged copy, or the repository's).
 * @returns The MCP tool result.
 */
export async function docsTool (args: { topic?: string, section?: string }, root: string): Promise<CallToolResult> {
  const topics = await listTopics(root)
  if (topics.length === 0) return text('The documentation is not installed with this server.', true)
  if (args.topic === undefined) return text({ topics, hint: 'Ask for one with { topic }, and for part of a long one with { topic, section }.' })
  const document = await readTopic(root, args.topic)
  if (document === undefined) {
    const close = topics.filter(topic => topic.id.includes(args.topic?.toLowerCase() ?? '') || args.topic?.includes(topic.id) === true).map(topic => topic.id)

    return text(`There is no document "${args.topic}". ${close.length > 0 ? `Did you mean: ${close.join(', ')}?` : `The documents are: ${topics.map(topic => topic.id).join(', ')}.`}`, true)
  }
  if (args.section !== undefined) {
    const section = sectionOf(document, args.section)

    return section === undefined
      ? text({ topic: args.topic, error: `no heading contains "${args.section}"`, outline: outlineOf(document).map(heading => `${'#'.repeat(heading.level)} ${heading.text}`) }, true)
      : text({ topic: args.topic, section: args.section, text: section })
  }
  if (document.length <= WHOLE_DOCUMENT_LIMIT) return text({ topic: args.topic, text: document })

  return text({ topic: args.topic, outline: outlineOf(document).map(heading => `${'#'.repeat(heading.level)} ${heading.text}`), note: `This document is ${String(document.length)} characters: ask for a section with { topic, section } using a heading from the outline.` })
}
