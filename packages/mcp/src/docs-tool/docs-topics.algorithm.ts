/** One heading of a document: how deep it is, its text and where its line is. */
export interface DocHeading {
  level: number
  text:  string
  line:  number
}

/**
 * The topic id of a documentation file: its path under the docs folder, without the extension and with forward slashes, so `recipes/authoring.md` is
 * `recipes/authoring`.
 *
 * @param relativePath - The file's path under the docs folder.
 * @returns The id.
 */
export function topicIdOf (relativePath: string): string {
  return relativePath.replaceAll('\\', '/').replace(/\.md$/i, '')
}

/**
 * The title of a document: its first top-level heading, else its id.
 *
 * @param markdown - The document.
 * @param fallback - The id, when there is no heading.
 * @returns The title.
 */
export function titleOf (markdown: string, fallback: string): string {
  const heading = outlineOf(markdown).find(candidate => candidate.level === 1)

  return heading?.text ?? fallback
}

/**
 * Every heading of a Markdown document, in order. A line inside a fenced code block is not a heading (a shell comment starts with `#` too).
 *
 * @param markdown - The document.
 * @returns The headings.
 */
export function outlineOf (markdown: string): DocHeading[] {
  const headings: DocHeading[] = []
  let fence: string | undefined
  for (const [line, text] of markdown.split(/\r?\n/).entries()) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1]
    if (marker !== undefined) {
      if (fence === undefined) fence = marker[0]
      else if (marker[0] === fence) fence = undefined
      continue
    }
    if (fence !== undefined) continue
    const match = /^(#{1,6}) (.+)$/.exec(text)
    if (match !== null) headings.push({ level: match[1].length, text: match[2].trim().replace(/ #+$/, ''), line })
  }

  return headings
}

/**
 * One section of a document: from the heading whose text contains `heading` (case-insensitive; an exact match wins over a partial one) to the next
 * heading of the same or a higher level, so its subsections come with it.
 *
 * @param markdown - The document.
 * @param heading - What the heading says, or part of it.
 * @returns The section's text, or `undefined` when no heading matches.
 */
export function sectionOf (markdown: string, heading: string): string | undefined {
  const wanted = heading.trim().toLowerCase()
  const headings = outlineOf(markdown)
  const start = headings.find(candidate => candidate.text.toLowerCase() === wanted) ?? headings.find(candidate => candidate.text.toLowerCase().includes(wanted))
  if (start === undefined) return undefined
  const end = headings.find(candidate => candidate.line > start.line && candidate.level <= start.level)
  const lines = markdown.split(/\r?\n/)

  return lines.slice(start.line, end?.line ?? lines.length).join('\n').trim()
}
