import { z } from 'zod'
import { outlineViewSchema } from './outline-view.contract'

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

/**
 * Writes a recipe file from an edited outline: the server converts it back
 * to the recipe's JSON (`scope-outline`'s `outlineToRecipe`) and saves it
 * exactly as `save-recipe` would. Kept as its own command, rather than
 * asking the Steps tab to run the outline↔recipe mappers itself, so that
 * conversion stays server-side code (it already is: `@opencraw/studio`'s
 * root export also carries Node-only slices, so the UI never imports
 * runtime code from it, only types — see `apps/studio-ui`'s `steps-outline`
 * for where this is called from).
 */
export const saveOutlineCommandSchema = z.object({
  type:    z.literal('save-outline'),
  path:    z.string().min(1),
  outline: outlineViewSchema,
})

/**
 * Captures the snapshot the content pane shows for a step (`page-snapshot`'s
 * `take-snapshot.use-case.ts`), caching it by recipe and step path so
 * switching the selected step does not always re-run the recipe.
 */
export const takeSnapshotCommandSchema = z.object({
  type:     z.literal('take-snapshot'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
})

/**
 * Verifies a candidate selector against the cached snapshot and, when
 * reachable, the live page — the studio's own selection (`@opencraw/core`'s
 * `countMatches`), never the browser's or a guess (issue #91).
 */
export const verifySelectorCommandSchema = z.object({
  type:     z.literal('verify-selector'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
  selector: z.string().min(1),
})

/**
 * Turns one or two picked nodes (their `data-oc-node` ids, off the cached
 * snapshot) into a verified selector: one id for a `Read` card's field, two
 * for the safe item+field list shape `selector-inference`'s `inferList`
 * builds by construction (issue #91, studio plan §3.2).
 */
const pickedNodeIdSchema = z.string().min(1)
const onePickedNodeSchema = z.tuple([pickedNodeIdSchema])
const twoPickedNodesSchema = z.tuple([pickedNodeIdSchema, pickedNodeIdSchema])

export const inferSelectorCommandSchema = z.object({
  type:     z.literal('infer-selector'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
  nodeIds:  z.union([onePickedNodeSchema, twoPickedNodesSchema]),
})

/** A missing value in an emitted record, by its position in the last sample run's records (the order they streamed in, matching the UI's own `records` list). */
export const missingWhyTargetSchema = z.object({
  kind:        z.literal('missing'),
  recipeId:    z.string().min(1),
  recordIndex: z.int().nonnegative(),
  field:       z.string().min(1),
})

/** A rejected record, by its position in the last sample run's `rejectedRecords`. */
export const rejectedWhyTargetSchema = z.object({
  kind:          z.literal('rejected'),
  recipeId:      z.string().min(1),
  rejectedIndex: z.int().nonnegative(),
})

export const whyTargetSchema = z.discriminatedUnion('kind', [missingWhyTargetSchema, rejectedWhyTargetSchema])

/**
 * Explains one missing or rejected value from the recipe's last sample run
 * (`explain-why.use-case.ts`, issue #92's Why? tab): the mapping trace and
 * scope snapshot `run-sample` already kept, the step that bound the value's
 * source id and whether it ran, was skipped or found nothing, and the
 * missing-value policy that applied.
 */
export const explainWhyCommandSchema = z.object({
  type:   z.literal('explain-why'),
  target: whyTargetSchema,
})

/**
 * Opens the studio's own headed browser window and starts recording user
 * actions on it (issue #95, phase 6): clicks, fills, selects, key presses
 * and scrolls stream back as `recording-card` events, each already a
 * verified step. `recipeId`'s start point is where the window opens.
 */
export const startRecordingCommandSchema = z.object({
  type:     z.literal('start-recording'),
  recipeId: z.string().min(1),
})

/**
 * Closes the recording window, if one is open; a no-op otherwise. Answers
 * with every step recorded, in order, so the caller can offer "make this
 * the login" (writes them under `session.bootstrap`) or "keep as steps"
 * (appends them to the recipe's own `steps`) without a second round trip.
 */
export const stopRecordingCommandSchema = z.object({
  type: z.literal('stop-recording'),
})

export const studioCommandSchema = z.discriminatedUnion('type', [
  openWorkspaceCommandSchema,
  runSampleCommandSchema,
  stopRunCommandSchema,
  saveRecipeCommandSchema,
  fetchStartPageCommandSchema,
  saveOutlineCommandSchema,
  takeSnapshotCommandSchema,
  verifySelectorCommandSchema,
  inferSelectorCommandSchema,
  explainWhyCommandSchema,
  startRecordingCommandSchema,
  stopRecordingCommandSchema,
])

export type SampleBudget = z.infer<typeof sampleBudgetSchema>
export type OpenWorkspaceCommand = z.infer<typeof openWorkspaceCommandSchema>
export type RunSampleCommand = z.infer<typeof runSampleCommandSchema>
export type StopRunCommand = z.infer<typeof stopRunCommandSchema>
export type SaveRecipeCommand = z.infer<typeof saveRecipeCommandSchema>
export type FetchStartPageCommand = z.infer<typeof fetchStartPageCommandSchema>
export type SaveOutlineCommand = z.infer<typeof saveOutlineCommandSchema>
export type TakeSnapshotCommand = z.infer<typeof takeSnapshotCommandSchema>
export type VerifySelectorCommand = z.infer<typeof verifySelectorCommandSchema>
export type InferSelectorCommand = z.infer<typeof inferSelectorCommandSchema>
export type MissingWhyTarget = z.infer<typeof missingWhyTargetSchema>
export type RejectedWhyTarget = z.infer<typeof rejectedWhyTargetSchema>
export type WhyTarget = z.infer<typeof whyTargetSchema>
export type ExplainWhyCommand = z.infer<typeof explainWhyCommandSchema>
export type StartRecordingCommand = z.infer<typeof startRecordingCommandSchema>
export type StopRecordingCommand = z.infer<typeof stopRecordingCommandSchema>
/** Every command the UI can send the server, over HTTP POST. */
export type StudioCommand = z.infer<typeof studioCommandSchema>
