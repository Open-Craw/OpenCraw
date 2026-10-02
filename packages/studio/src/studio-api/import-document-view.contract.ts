import { z } from 'zod'

/** `import-document`'s answer: where the copy landed, and the `file:` URL a recipe's `start.url` points at it with. */
export const importDocumentViewSchema = z.object({
  path: z.string().min(1),
  url:  z.string().startsWith('file:'),
})

export type ImportDocumentView = z.infer<typeof importDocumentViewSchema>
