import { z } from 'zod'

/**
 * `detect-url`'s answer: what the address returns, so "Load ▾ Web page" starts the right recipe: `html` is a page (opened in a
 * browser); `json`, `pdf`, `csv`, `xlsx`, `markdown`, `xml`... are documents (read with a request); `unknown` when it could not be fetched.
 */
export const detectUrlViewSchema = z.object({
  kind: z.enum(['html', 'json', 'jsonl', 'text', 'pdf', 'csv', 'xlsx', 'pptx', 'yaml', 'markdown', 'xml', 'docx', 'unknown']),
})

export type DetectUrlView = z.infer<typeof detectUrlViewSchema>
