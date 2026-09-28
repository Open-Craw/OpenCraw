import { z } from 'zod'

/** Why a sample run stopped before finishing on its own; mirrors `@opencraw/core`'s `RecipeReport.stoppedBy`. */
export const stoppedBySchema = z.enum(['sample-maxRecords', 'sample-maxPages', 'sample-maxMs'])

/** One line of the engine's own trace output (`traceLine`), streamed as a sample run proceeds. */
export const traceLineEventSchema = z.object({
  type: z.literal('trace-line'),
  line: z.string(),
})

/** One record a sample run emitted. */
export const recordEventSchema = z.object({
  type:     z.literal('record'),
  recipeId: z.string(),
  key:      z.string().nullable(),
  data:     z.record(z.string(), z.unknown()),
})

/** A sample run ended: how many records, and why it stopped when it did not finish on its own. */
export const runFinishedEventSchema = z.object({
  type:       z.literal('run-finished'),
  recipeId:   z.string(),
  emitted:    z.number(),
  rejected:   z.number(),
  duplicates: z.number(),
  durationMs: z.number(),
  error:      z.string().optional(),
  stoppedBy:  stoppedBySchema.optional(),
})

/** The workspace's recipes changed on disk (a save, or a future watcher) and should be re-fetched. */
export const workspaceChangedEventSchema = z.object({
  type: z.literal('workspace-changed'),
})

export const studioEventSchema = z.discriminatedUnion('type', [
  traceLineEventSchema,
  recordEventSchema,
  runFinishedEventSchema,
  workspaceChangedEventSchema,
])

export type StoppedBy = z.infer<typeof stoppedBySchema>
export type TraceLineEvent = z.infer<typeof traceLineEventSchema>
export type RecordEvent = z.infer<typeof recordEventSchema>
export type RunFinishedEvent = z.infer<typeof runFinishedEventSchema>
export type WorkspaceChangedEvent = z.infer<typeof workspaceChangedEventSchema>
/** Every event the server pushes to the UI over the WebSocket. */
export type StudioEvent = z.infer<typeof studioEventSchema>
