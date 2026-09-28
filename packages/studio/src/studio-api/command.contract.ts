import { z } from 'zod'

/** A budget for a sample run; never authored into a recipe, only asked for by the caller. */
export const sampleBudgetSchema = z.object({
  maxRecords: z.number().int().positive().optional(),
  maxPages:   z.number().int().positive().optional(),
  maxMs:      z.number().int().positive().optional(),
})

/** Opens a recipe folder: the server reads it and answers with a `WorkspaceView`. */
export const openWorkspaceCommandSchema = z.object({
  type:   z.literal('open-workspace'),
  folder: z.string().min(1),
})

/** Runs one input recipe under a budget, streaming `trace-line` and `record` events, ending in `run-finished`. */
export const runSampleCommandSchema = z.object({
  type:     z.literal('run-sample'),
  recipeId: z.string().min(1),
  budget:   sampleBudgetSchema.optional(),
})

/** Closes the crawler of the run in progress, if any; a no-op otherwise. */
export const stopRunCommandSchema = z.object({
  type: z.literal('stop-run'),
})

/** Writes a recipe file: the whole object, pretty-printed by the server (see `recipe-workspace`). */
export const saveRecipeCommandSchema = z.object({
  type:   z.literal('save-recipe'),
  path:   z.string().min(1),
  recipe: z.record(z.string(), z.unknown()),
})

/** Fetches the HTML of an input recipe's start page, as the engine would see it. */
export const fetchStartPageCommandSchema = z.object({
  type:     z.literal('fetch-start-page'),
  recipeId: z.string().min(1),
})

export const studioCommandSchema = z.discriminatedUnion('type', [
  openWorkspaceCommandSchema,
  runSampleCommandSchema,
  stopRunCommandSchema,
  saveRecipeCommandSchema,
  fetchStartPageCommandSchema,
])

export type SampleBudget = z.infer<typeof sampleBudgetSchema>
export type OpenWorkspaceCommand = z.infer<typeof openWorkspaceCommandSchema>
export type RunSampleCommand = z.infer<typeof runSampleCommandSchema>
export type StopRunCommand = z.infer<typeof stopRunCommandSchema>
export type SaveRecipeCommand = z.infer<typeof saveRecipeCommandSchema>
export type FetchStartPageCommand = z.infer<typeof fetchStartPageCommandSchema>
/** Every command the UI can send the server, over HTTP POST. */
export type StudioCommand = z.infer<typeof studioCommandSchema>
