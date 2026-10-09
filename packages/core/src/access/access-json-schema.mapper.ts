import { z } from 'zod'
import { accessCalloutInputSchema, accessCalloutOutputSchema } from './access-callout.contract'
import { accessConfigSchema } from './access-profile.contract'

/**
 * The JSON Schema for access config files, for editors: point `$schema` at
 * `schemas/access-config.schema.json`.
 *
 * @returns A draft 2020-12 document.
 */
export function accessConfigJsonSchema (): Record<string, unknown> {
  return { ...z.toJSONSchema(accessConfigSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' }), $id: 'https://opencraw/schemas/access-config.schema.json', title: 'OpenCraw access config' }
}

/**
 * The JSON Schemas for what an access callout carries, for a lease service in any language to implement:
 * the `input` of its request (`schemas/callout-access-input.schema.json`) and the `output` of its answer
 * (`schemas/callout-access-output.schema.json`).
 *
 * @returns One draft 2020-12 document for each.
 */
export function accessCalloutJsonSchemas (): { input: Record<string, unknown>, output: Record<string, unknown> } {
  const options = { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' } as const

  return {
    input:  { ...z.toJSONSchema(accessCalloutInputSchema, options), $id: 'https://opencraw/schemas/callout-access-input.schema.json', title: 'OpenCraw access callout input' },
    output: { ...z.toJSONSchema(accessCalloutOutputSchema, options), $id: 'https://opencraw/schemas/callout-access-output.schema.json', title: 'OpenCraw access callout output' },
  }
}
