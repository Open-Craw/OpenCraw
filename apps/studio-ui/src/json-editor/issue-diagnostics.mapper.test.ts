import type { RecipeIssue } from '@opencraw/studio'
import { issueDiagnostics } from './issue-diagnostics.mapper'

const TEXT = '{\n  "kind": "input",\n  "mapping": {\n    "title": { "from": "h1" }\n  },\n  "fields": {\n    "stock.count": { "type": "number" }\n  }\n}\n'

describe('issueDiagnostics', () => {
  it('places a diagnostic at the node a dotted path points to', () => {
    const issues: RecipeIssue[] = [{ path: 'mapping.title', message: 'no such field', kind: 'binding' }]
    const [diagnostic] = issueDiagnostics(TEXT, issues)
    expect(TEXT.slice(diagnostic.from, diagnostic.to)).toBe('{ "from": "h1" }')
    expect(diagnostic.message).toBe('no such field')
    expect(diagnostic.severity).toBe('warning')
  })

  it('reads a bracketed, quoted key as one segment, not nesting on its dot', () => {
    const issues: RecipeIssue[] = [{ path: 'fields["stock.count"]', message: 'bad type', kind: 'validation' }]
    const [diagnostic] = issueDiagnostics(TEXT, issues)
    expect(TEXT.slice(diagnostic.from, diagnostic.to)).toBe('{ "type": "number" }')
    expect(diagnostic.severity).toBe('error')
  })

  it('falls back to the whole document for the root path or a path that no longer resolves', () => {
    const issues: RecipeIssue[] = [
      { path: '', message: 'root problem', kind: 'validation' },
      { path: 'no.such.path', message: 'stale path', kind: 'validation' },
    ]
    const diagnostics = issueDiagnostics(TEXT, issues)
    expect(diagnostics).toHaveLength(2)
    for (const diagnostic of diagnostics) expect(TEXT.slice(diagnostic.from, diagnostic.to)).toBe(TEXT.trim())
  })

  it('returns no diagnostics for empty text: nothing for jsonc-parser to build a tree from', () => {
    expect(issueDiagnostics('', [{ path: 'a', message: 'x', kind: 'validation' }])).toEqual([])
  })
})
