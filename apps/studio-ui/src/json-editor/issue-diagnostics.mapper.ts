import type { Diagnostic } from '@codemirror/lint'
import { findNodeAtLocation, parseTree } from 'jsonc-parser'
import type { RecipeIssue } from '@opencraw/studio'

/**
 * Turns a recipe's server-reported issues into CodeMirror diagnostics, placed at the JSON node their
 * path points at (the whole document when the path is empty or the node cannot be found — a stale path
 * after an edit, say).
 */
export function issueDiagnostics (text: string, issues: readonly RecipeIssue[]): Diagnostic[] {
  const root = parseTree(text)
  if (root === undefined) return []

  return issues.map(issue => {
    const node = findNodeAtLocation(root, parsePathSegments(issue.path)) ?? root

    return { from: node.offset, to: node.offset + node.length, severity: issue.kind === 'binding' ? 'warning' : 'error', message: issue.message }
  })
}

/**
 * Reads a path the way `recipe.validator.ts`'s `pathText` writes it: `steps.0.id`, a key that is not a
 * plain word in brackets, `fields["stock.count"]`.
 *
 * @param path - The issue's path; `''` for the root.
 * @returns Segments as `jsonc-parser`'s `findNodeAtLocation` expects: a number for an array index, else a string.
 */
function parsePathSegments (path: string): (string | number)[] {
  if (path === '') return []
  const segments: (string | number)[] = []
  const pattern = /\[("(?:[^"\\]|\\.)*")\]|([^.[]+)/g
  for (const match of path.matchAll(pattern)) {
    if (match[1] === undefined) segments.push(/^\d+$/.test(match[2]) ? Number(match[2]) : match[2])
    else segments.push(JSON.parse(match[1]) as string)
  }

  return segments
}
