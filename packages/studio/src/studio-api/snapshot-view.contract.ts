import { z } from 'zod'
import { BODY_KINDS } from '@opencraw/core'

/**
 * What `take-snapshot` answers with: the rewritten document ready for the
 * content pane's sandboxed iframe (studio plan §3.1, issue #91). `format`
 * (api mode only; absent in web mode, whose document is always HTML) is
 * what the content pane uses to choose a canvas — the snapshot iframe for
 * `html` (and `docx`/`markdown`, already turned into HTML), else
 * `document-view`'s tree/pdf/grid/deck canvas (studio plan §3.4, issue #94).
 */
export const snapshotViewSchema = z.object({
  html:      z.string(),
  nodeCount: z.number(),
  baseUrl:   z.string(),
  format:    z.enum(BODY_KINDS).optional(),
})

export type SnapshotView = z.infer<typeof snapshotViewSchema>
