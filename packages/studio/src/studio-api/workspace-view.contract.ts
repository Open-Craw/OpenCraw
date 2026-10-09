import { z } from 'zod'
import { outlineViewSchema } from './outline-view.contract'

/** One problem found on a recipe file, with the JSON path it lives at. */
export const recipeIssueSchema = z.object({
  path:    z.string(),
  message: z.string(),
  kind:    z.enum(['validation', 'binding']),
})

/** One recipe file in an opened workspace. */
export const recipeListingSchema = z.object({
  file:    z.string(),
  kind:    z.enum(['input', 'output', 'unknown']),
  id:      z.string().optional(),
  issues:  z.array(recipeIssueSchema),
  /** The file's JSON, pretty-printed: the JSON tab's starting text (see `save-recipe` for how an edit is written back). */
  text:    z.string(),
  /** The Steps tab's view of this file's `steps`, from `@opencraw/studio`'s `scope-outline` slice. `input` recipes only; `undefined` for an `output` or `unknown` file, which has no steps to show. */
  outline: outlineViewSchema.optional(),
})

/** The hooks Studio was started with (`opencraw studio --hooks <file>`, issue #150): where they came from and what they are called, for the warning bar and the hook-name suggestions. */
export const loadedHooksSchema = z.object({
  source: z.string(),
  names:  z.array(z.string()),
})

/** What `open-workspace` answers with: every recipe file directly inside the folder, and the hooks Studio runs them with, if any. */
export const workspaceViewSchema = z.object({
  folder:  z.string(),
  recipes: z.array(recipeListingSchema),
  hooks:   loadedHooksSchema.optional(),
})

export type RecipeIssue = z.infer<typeof recipeIssueSchema>
export type RecipeListing = z.infer<typeof recipeListingSchema>
export type LoadedHooks = z.infer<typeof loadedHooksSchema>
export type WorkspaceView = z.infer<typeof workspaceViewSchema>
