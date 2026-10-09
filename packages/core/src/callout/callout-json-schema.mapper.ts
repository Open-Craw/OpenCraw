import { z } from 'zod'
import { calloutRequestSchema, calloutResponseSchema } from './callout.contract'

const OPTIONS = { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' } as const

/**
 * The JSON Schemas for the request and the response of a callout, for a service in any language to
 * implement (`schemas/callout-request.schema.json`, `schemas/callout-response.schema.json`).
 *
 * @returns One draft 2020-12 document for each.
 */
export function calloutJsonSchemas (): { request: Record<string, unknown>, response: Record<string, unknown> } {
  return {
    request:  { ...z.toJSONSchema(calloutRequestSchema, OPTIONS), $id: 'https://opencraw/schemas/callout-request.schema.json', title: 'OpenCraw callout request' },
    response: { ...z.toJSONSchema(calloutResponseSchema, OPTIONS), $id: 'https://opencraw/schemas/callout-response.schema.json', title: 'OpenCraw callout response' },
  }
}
