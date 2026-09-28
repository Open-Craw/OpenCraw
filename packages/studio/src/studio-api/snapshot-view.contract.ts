import { z } from 'zod'

/** What `take-snapshot` answers with: the rewritten document ready for the content pane's sandboxed iframe (studio plan §3.1, issue #91). */
export const snapshotViewSchema = z.object({
  html:      z.string(),
  nodeCount: z.number(),
  baseUrl:   z.string(),
})

export type SnapshotView = z.infer<typeof snapshotViewSchema>
