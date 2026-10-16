import { z } from 'zod'

/** `detect-url`'s answer: whether the address returns JSON (whatever content type it is served as), so it is read as a document rather than opened as a page. */
export const detectUrlViewSchema = z.object({
  json: z.boolean(),
})

export type DetectUrlView = z.infer<typeof detectUrlViewSchema>
