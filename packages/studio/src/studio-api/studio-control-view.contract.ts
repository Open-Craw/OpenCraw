import { z } from 'zod'
import { sampleRunRecordSchema } from './sample-run-view.contract'

/** How many pages were listening when a controller asked them to do something: none means nobody has Studio open. */
export const askUiViewSchema = z.object({ pages: z.number(), requestId: z.string() })

/** How a controller's request went: `pending` until a page reported, then what it said. */
export const uiOutcomeViewSchema = z.object({
  state:   z.enum(['pending', 'done']),
  ok:      z.boolean().optional(),
  message: z.string().optional(),
  detail:  z.record(z.string(), z.unknown()).optional(),
})

/** What Studio is doing: its workspace, how many pages are open, and the recipe whose sample run is in progress. */
export const studioStatusViewSchema = z.object({
  folder:  z.string().optional(),
  pages:   z.number(),
  running: z.string().optional(),
})

const rejectionSchema = z.object({ field: z.string(), reason: z.string(), url: z.string() })

/** How a recipe's sample run is going; `result` only once it finished: the counts, the first records and the first rejections (the rest are in Studio). */
export const runStatusViewSchema = z.object({
  recipeId: z.string(),
  state:    z.enum(['running', 'finished', 'never-run']),
  result:   z.object({
    emitted:    z.number(),
    rejected:   z.number(),
    duplicates: z.number(),
    durationMs: z.number(),
    error:      z.string().optional(),
    stoppedBy:  z.string().optional(),
    records:    z.array(sampleRunRecordSchema),
    rejections: z.array(rejectionSchema),
  }).optional(),
})

export type UiOutcomeView = z.infer<typeof uiOutcomeViewSchema>
export type AskUiView = z.infer<typeof askUiViewSchema>
export type StudioStatusView = z.infer<typeof studioStatusViewSchema>
export type RunStatusView = z.infer<typeof runStatusViewSchema>
