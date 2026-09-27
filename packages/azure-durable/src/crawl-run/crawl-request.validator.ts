import { z } from 'zod'

const recipeObject = z.record(z.string(), z.unknown())
const options = z.strictObject({
  /** `recipe` (default) or `off`: each input recipe runs in its own activity, so nothing spans them. */
  dedupe: z.enum(['recipe', 'off']).optional(),
}).optional()
const inlineRecipes = z.strictObject({ output: recipeObject, inputs: z.array(recipeObject).min(1), options })
const namedRecipes = z.strictObject({ recipe: z.strictObject({ name: z.string().min(1), version: z.string().min(1) }), options })

/** A `/crawl` body: the recipes themselves, or the name and version of a stored set. */
export const crawlRequestSchema = z.union([inlineRecipes, namedRecipes])

export type CrawlRequest = z.infer<typeof crawlRequestSchema>
