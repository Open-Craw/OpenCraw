import { z } from 'zod'
import { outlineNodeSchema } from './outline-view.contract'

/** Why a sample run stopped before finishing on its own; mirrors `@opencraw/core`'s `RecipeReport.stoppedBy`. */
export const stoppedBySchema = z.enum(['sample-maxRecords', 'sample-maxPages', 'sample-maxMs'])

/** One line of the engine's own trace output (`traceLine`), streamed as a sample run proceeds. */
export const traceLineEventSchema = z.object({
  type: z.literal('trace-line'),
  line: z.string(),
})

/** One transform's effect within a field's trace: its `op` and the value it returned. */
const traceStepSchema = z.object({ op: z.string(), value: z.unknown() })

/** One entry of a mapping trace field: what a rule's `from` read, and the value after each transform, in order (`@opencraw/core`'s `FieldTrace`). */
export const fieldTraceSchema = z.object({
  from:  z.unknown(),
  steps: z.array(traceStepSchema),
})

/** One record a sample run emitted: `scope` (what it was mapped from) and `mapping` (each field's trace) ride along, so the Record tab (#92) can show a transform chain's real values without a second round trip. */
export const recordEventSchema = z.object({
  type:     z.literal('record'),
  recipeId: z.string(),
  key:      z.string().nullable(),
  data:     z.record(z.string(), z.unknown()),
  scope:    z.record(z.string(), z.unknown()).optional(),
  mapping:  z.record(z.string(), fieldTraceSchema).optional(),
})

/** One record a sample run rejected (a field's `skip-record` policy on a missing or uncoercible value). */
export const recordRejectedEventSchema = z.object({
  type:     z.literal('record-rejected'),
  recipeId: z.string(),
  field:    z.string(),
  reason:   z.string(),
  scope:    z.record(z.string(), z.unknown()).optional(),
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

/**
 * One recorded action landed as a step (issue #95): the card it becomes
 * (`scope-outline`'s own `OutlineCard`/`OutlineBracket` shape — the wire
 * form `outline-view.contract.ts` already defines, never a second card
 * format) and whether its value is a secret placeholder, for the secret
 * pill styling.
 */
export const recordingCardEventSchema = z.object({
  type:   z.literal('recording-card'),
  node:   outlineNodeSchema,
  secret: z.boolean(),
})

/** A notice from the recording session that is not itself a step: a "next" link offer, or an unsupported iframe/shadow-DOM report. */
export const recordingNoteEventSchema = z.object({
  type:    z.literal('recording-note'),
  kind:    z.enum(['next-link', 'unsupported', 'info']),
  message: z.string(),
})

/** One recorded step's raw JSON, exactly as `flow-recording` built it. */
const recordedStepSchema = z.record(z.string(), z.unknown())

/** The recording window closed — `stop-recording` completed, or the window was closed some other way. `steps` is every step recorded, in order, exactly as `stop-recording`'s own response carries them. */
export const recordingStoppedEventSchema = z.object({
  type:  z.literal('recording-stopped'),
  steps: z.array(recordedStepSchema),
})

export const studioEventSchema = z.discriminatedUnion('type', [
  traceLineEventSchema,
  recordEventSchema,
  recordRejectedEventSchema,
  runFinishedEventSchema,
  workspaceChangedEventSchema,
  recordingCardEventSchema,
  recordingNoteEventSchema,
  recordingStoppedEventSchema,
])

export type StoppedBy = z.infer<typeof stoppedBySchema>
export type TraceLineEvent = z.infer<typeof traceLineEventSchema>
export type FieldTraceView = z.infer<typeof fieldTraceSchema>
export type RecordEvent = z.infer<typeof recordEventSchema>
export type RecordRejectedEvent = z.infer<typeof recordRejectedEventSchema>
export type RunFinishedEvent = z.infer<typeof runFinishedEventSchema>
export type WorkspaceChangedEvent = z.infer<typeof workspaceChangedEventSchema>
export type RecordingCardEvent = z.infer<typeof recordingCardEventSchema>
export type RecordingNoteEvent = z.infer<typeof recordingNoteEventSchema>
export type RecordingStoppedEvent = z.infer<typeof recordingStoppedEventSchema>
/** Every event the server pushes to the UI over the WebSocket. */
export type StudioEvent = z.infer<typeof studioEventSchema>
