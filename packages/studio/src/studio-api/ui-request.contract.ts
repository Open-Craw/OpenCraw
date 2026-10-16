import { z } from 'zod'

/** What an outside controller (an agent, through the MCP server) can ask the open Studio page to do. Grows one `kind` at a time. */
export const uiRequestSchema = z.discriminatedUnion('kind', [
  /** Open a folder, a recipe file or a document, exactly as a Studio link does (`open-path`); `workspace` is the folder a document belongs to. */
  z.object({ kind: z.literal('open'), path: z.string().min(1), workspace: z.string().min(1).optional() }),
])

export type UiRequest = z.infer<typeof uiRequestSchema>
