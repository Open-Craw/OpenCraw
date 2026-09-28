import { z } from 'zod'
import { stoppedBySchema } from './event.contract'

/** One record of a sample run's result, kept for the Records tab. */
export const sampleRunRecordSchema = z.object({
  key:  z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
})

/** The last sample run's result, for a client that opens the UI after it finished. */
export const sampleRunViewSchema = z.object({
  recipeId:   z.string(),
  emitted:    z.number(),
  rejected:   z.number(),
  duplicates: z.number(),
  durationMs: z.number(),
  error:      z.string().optional(),
  stoppedBy:  stoppedBySchema.optional(),
  records:    z.array(sampleRunRecordSchema),
  trace:      z.array(z.string()),
})

export type SampleRunRecord = z.infer<typeof sampleRunRecordSchema>
export type SampleRunView = z.infer<typeof sampleRunViewSchema>
