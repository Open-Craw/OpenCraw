import { z } from 'zod'

/**
 * `open-path`'s answer: what the path turned out to be, and the folder to
 * open as the workspace for it. A `recipe` names the input recipe to select
 * when there is one; a `document` is where the file is read from (in place
 * when it is already inside the folder, else the copy made there) and its
 * `file:` URL, ready for a recipe's `start.url`.
 */
export const openPathViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('folder'), folder: z.string().min(1) }),
  z.object({ kind: z.literal('recipe'), folder: z.string().min(1), recipeId: z.string().min(1).optional() }),
  z.object({ kind: z.literal('document'), folder: z.string().min(1), path: z.string().min(1), url: z.string().startsWith('file:') }),
])

export type OpenPathView = z.infer<typeof openPathViewSchema>
