import { z } from 'zod'
import { captchaCalloutInputSchema, captchaCalloutOutputSchema } from './captcha-callout.contract'

const OPTIONS = { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' } as const

/**
 * The JSON Schemas for what a captcha callout carries, for a solving service in any language to implement:
 * the `input` of its request (`schemas/callout-captcha-input.schema.json`) and the `output` of its answer
 * (`schemas/callout-captcha-output.schema.json`).
 *
 * @returns One draft 2020-12 document for each.
 */
export function captchaCalloutJsonSchemas (): { input: Record<string, unknown>, output: Record<string, unknown> } {
  return {
    input:  { ...z.toJSONSchema(captchaCalloutInputSchema, OPTIONS), $id: 'https://opencraw/schemas/callout-captcha-input.schema.json', title: 'OpenCraw captcha callout input' },
    output: { ...z.toJSONSchema(captchaCalloutOutputSchema, OPTIONS), $id: 'https://opencraw/schemas/callout-captcha-output.schema.json', title: 'OpenCraw captcha callout output' },
  }
}
