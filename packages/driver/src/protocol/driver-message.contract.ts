import { calloutRequestSchema, calloutResponseSchema } from '@opencraw/core'
import { z } from 'zod'

/**
 * The driver protocol's version, separate from the package's: a client pins a major and the driver refuses
 * another. Additions (methods, optional fields) raise the minor; anything a client could break on, the major.
 */
export const PROTOCOL_VERSION = '1.0.0'

const recipeObject = z.record(z.string(), z.unknown())

/** Where recipes come from: files and folders the driver reads, or the recipes themselves. Exactly one. */
const recipeSource = {
  paths:   z.array(z.string()).min(1).optional(),
  recipes: z.array(recipeObject).min(1).optional(),
}

// Client to driver: requests.

export const initializeParamsSchema = z.strictObject({
  clientName:      z.string().min(1),
  clientVersion:   z.string().min(1),
  protocolVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
})
export type InitializeParams = z.infer<typeof initializeParamsSchema>

export const initializeResultSchema = z.strictObject({
  driverVersion:   z.string(),
  protocolVersion: z.string(),
  methods:         z.array(z.string()),
})
export type InitializeResult = z.infer<typeof initializeResultSchema>

export const validateParamsSchema = z.strictObject({ ...recipeSource, only: z.array(z.string()).optional() })
export type ValidateParams = z.infer<typeof validateParamsSchema>

const issueSchema = z.strictObject({ source: z.string().optional(), recipeId: z.string().optional(), path: z.string(), message: z.string() })

export const validateResultSchema = z.strictObject({
  ok:     z.boolean(),
  /** The input recipes that would run, when ok. */
  inputs: z.array(z.string()),
  /** Every hook the recipes call, which a `run` must serve. */
  hooks:  z.array(z.string()),
  issues: z.array(issueSchema),
})
export type ValidateResult = z.infer<typeof validateResultSchema>

export const runParamsSchema = z.strictObject({
  ...recipeSource,
  only:     z.array(z.string()).optional(),
  /** A file to write the records to, its extension naming the format; without it, each record is sent as a `record` notification. */
  out:      z.string().optional(),
  append:   z.boolean().optional(),
  resume:   z.boolean().optional(),
  dryRun:   z.boolean().optional(),
  parallel: z.number().int().min(1).max(16).optional(),
  browser:  z.strictObject({ headless: z.boolean().optional(), executablePath: z.string().optional(), ignoreHTTPSErrors: z.boolean().optional() }).optional(),
  /** The hooks the client answers itself: each becomes a `callout` request to the client when a recipe calls it. */
  hooks:    z.array(z.string()).optional(),
})
export type RunParams = z.infer<typeof runParamsSchema>

export const runResultSchema = z.strictObject({ runId: z.string() })
export type RunResult = z.infer<typeof runResultSchema>

export const cancelParamsSchema = z.strictObject({ runId: z.string() })
export type CancelParams = z.infer<typeof cancelParamsSchema>

export const cancelResultSchema = z.strictObject({ cancelled: z.boolean() })
export type CancelResult = z.infer<typeof cancelResultSchema>

export const shutdownResultSchema = z.strictObject({})

// Driver to client: notifications, and the callout request.

/** Every crawl event, as core reports it (`CrawlEvent`); its shape is core's, versioned with core. */
export const eventParamsSchema = z.strictObject({ runId: z.string(), event: z.record(z.string(), z.unknown()) })
export type EventParams = z.infer<typeof eventParamsSchema>

export const recordParamsSchema = z.strictObject({ runId: z.string(), recipeId: z.string(), key: z.string().nullable(), data: z.record(z.string(), z.unknown()) })
export type RecordParams = z.infer<typeof recordParamsSchema>

export const finishedParamsSchema = z.strictObject({
  runId:  z.string(),
  /** The crawl report (`CrawlReport`), absent when the run could not start. */
  report: z.record(z.string(), z.unknown()).optional(),
  /** Why the run could not start, or stopped as a whole. */
  error:  z.string().optional(),
})
export type FinishedParams = z.infer<typeof finishedParamsSchema>

/** A hook the client serves: core's own callout request, answered with core's callout response. */
export const calloutParamsSchema = z.strictObject({ runId: z.string(), request: calloutRequestSchema })
export type CalloutParams = z.infer<typeof calloutParamsSchema>
export const calloutResultSchema = calloutResponseSchema

/** Every method and notification, by name: what the generated schema and the clients' models are made from. */
export const MESSAGES = {
  initialize: { direction: 'client-to-driver', params: initializeParamsSchema, result: initializeResultSchema },
  validate:   { direction: 'client-to-driver', params: validateParamsSchema, result: validateResultSchema },
  run:        { direction: 'client-to-driver', params: runParamsSchema, result: runResultSchema },
  cancel:     { direction: 'client-to-driver', params: cancelParamsSchema, result: cancelResultSchema },
  shutdown:   { direction: 'client-to-driver', params: undefined, result: shutdownResultSchema },
  callout:    { direction: 'driver-to-client', params: calloutParamsSchema, result: calloutResultSchema },
  event:      { direction: 'driver-to-client', params: eventParamsSchema, result: undefined },
  record:     { direction: 'driver-to-client', params: recordParamsSchema, result: undefined },
  finished:   { direction: 'driver-to-client', params: finishedParamsSchema, result: undefined },
} as const
