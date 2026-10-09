import { z } from 'zod'
import { calloutRequestSchema, calloutResolutionSchema, calloutResponseSchema } from './callout.contract'

const OPTIONS = { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' } as const

/**
 * The JSON Schemas for the request, the response and the posted-back resolution of a callout, for a
 * service in any language to implement (`schemas/callout-request.schema.json`,
 * `schemas/callout-response.schema.json`, `schemas/callout-resolution.schema.json`).
 *
 * @returns One draft 2020-12 document for each.
 */
export function calloutJsonSchemas (): { request: Record<string, unknown>, response: Record<string, unknown>, resolution: Record<string, unknown> } {
  return {
    request:    { ...z.toJSONSchema(calloutRequestSchema, OPTIONS), $id: 'https://opencraw/schemas/callout-request.schema.json', title: 'OpenCraw callout request' },
    response:   { ...z.toJSONSchema(calloutResponseSchema, OPTIONS), $id: 'https://opencraw/schemas/callout-response.schema.json', title: 'OpenCraw callout response' },
    resolution: { ...z.toJSONSchema(calloutResolutionSchema, OPTIONS), $id: 'https://opencraw/schemas/callout-resolution.schema.json', title: 'OpenCraw callout resolution' },
  }
}
