import { z } from 'zod'

/** What an outside controller (an agent, through the MCP server) can ask the open Studio page to do. Grows one `kind` at a time. */
export const uiRequestSchema = z.discriminatedUnion('kind', [
  /** Open a folder, a recipe file or a document, exactly as a Studio link does (`open-path`); `workspace` is the folder a document belongs to. */
  z.object({ kind: z.literal('open'), path: z.string().min(1), workspace: z.string().min(1).optional() }),
  /**
   * Pick a value on the recipe's web page, as a click would: the page finds the element by `selector` (a CSS selector) or by its `text`,
   * stages it the way a click does (the ways to reach it are shown to choose from) and, with `add`, adds it to the recipe.
   */
  z.object({ kind: z.literal('pick'), recipeId: z.string().min(1), selector: z.string().min(1).optional(), text: z.string().min(1).optional(), add: z.boolean().optional() }),
])

export type UiRequest = z.infer<typeof uiRequestSchema>
