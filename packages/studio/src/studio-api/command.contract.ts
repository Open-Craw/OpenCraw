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

/**
 * The Inspect panel's DOM tree and data-in-the-page findings, off the same
 * cached snapshot `take-snapshot`/`infer-selector` already use (`page-inspector`,
 * issue #93). Call `take-snapshot` first, same as `infer-selector`.
 */
export const inspectPageCommandSchema = z.object({
  type:     z.literal('inspect-page'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
})

/**
 * The JSON responses seen while a recipe's start page rendered
 * (`page-inspector`'s `responses-seen.use-case.ts`, issue #93), for the
 * Inspect panel's "responses seen" list. Opens its own browser session
 * (see that use-case's doc comment for why); slower than `inspect-page`.
 */
export const responsesSeenCommandSchema = z.object({
  type:     z.literal('responses-seen'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
})

/**
 * The document tree for the content pane's tree canvas (`document-view`'s
 * `tree-view.mapper.ts`, studio plan §3.4, issue #94's 5a), off the same
 * cached snapshot `take-snapshot`/`inspect-page` already use — call
 * `take-snapshot` first, same as `inspect-page`. Only a JSON/YAML/XML
 * snapshot has one; PDF, workbook and deck documents get their own canvases
 * (5b/5c/5d).
 */
export const documentTreeCommandSchema = z.object({
  type:     z.literal('document-tree'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
})

/**
 * The PDF canvas's cells and rows (`document-view`'s `pdf-view.mapper.ts`,
 * studio plan §3.4, issue #94's 5b), off the same cached snapshot
 * `take-snapshot`/`document-tree` already use — call `take-snapshot` first.
 * Only a PDF snapshot has one; JSON/YAML/XML get the tree canvas (5a), the
 * workbook and deck their own canvases (5c/5d).
 */
export const pdfViewCommandSchema = z.object({
  type:     z.literal('pdf-view'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
})

/** A `table` extract's options, as the studio's PDF canvas picks build them — mirrors `document-view/table-preview.use-case.ts`'s `TablePreviewOptions`. */
export const tablePreviewOptionsSchema = z.object({
  header:  z.string().min(1),
  until:   z.string().min(1).optional(),
  columns: z.record(z.string(), z.string().min(1)).optional(),
  align:   z.enum(['auto', 'top', 'center', 'bottom']).optional(),
})

/**
 * The live preview of a `table` extract's options against a cached PDF
 * snapshot (`document-view`'s `table-preview.use-case.ts`, studio plan §3.4,
 * issue #94's 5b): the matched rows to highlight on the page, recomputed as
 * the person edits the options — call `take-snapshot` first.
 */
export const tablePreviewCommandSchema = z.object({
  type:     z.literal('table-preview'),
  recipeId: z.string().min(1),
  path:     z.string().min(1),
  options:  tablePreviewOptionsSchema,
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
  inspectPageCommandSchema,
  responsesSeenCommandSchema,
  documentTreeCommandSchema,
  pdfViewCommandSchema,
  tablePreviewCommandSchema,
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
export type InspectPageCommand = z.infer<typeof inspectPageCommandSchema>
export type ResponsesSeenCommand = z.infer<typeof responsesSeenCommandSchema>
export type DocumentTreeCommand = z.infer<typeof documentTreeCommandSchema>
export type PdfViewCommand = z.infer<typeof pdfViewCommandSchema>
export type TablePreviewOptions = z.infer<typeof tablePreviewOptionsSchema>
export type TablePreviewCommand = z.infer<typeof tablePreviewCommandSchema>
export type MissingWhyTarget = z.infer<typeof missingWhyTargetSchema>
export type RejectedWhyTarget = z.infer<typeof rejectedWhyTargetSchema>
export type WhyTarget = z.infer<typeof whyTargetSchema>
export type ExplainWhyCommand = z.infer<typeof explainWhyCommandSchema>
/** Every command the UI can send the server, over HTTP POST. */
export type StudioCommand = z.infer<typeof studioCommandSchema>
