import { z } from 'zod'

const challengeSchema = z.strictObject({
  kind:     z.enum(['recaptcha-v2', 'recaptcha-v3', 'hcaptcha', 'turnstile', 'image', 'unknown']),
  url:      z.string(),
  siteKey:  z.string().optional(),
  action:   z.string().optional(),
  selector: z.string().optional(),
  field:    z.string().optional(),
  refresh:  z.string().optional(),
})

/**
 * What a captcha callout's `input` holds: the challenge the engine found, the attempt it is, and what a
 * service needs to solve it that is not in the challenge.
 */
export const captchaCalloutInputSchema = z.strictObject({
  challenge: challengeSchema,
  /** 1, 2, … within one solve loop. */
  attempt:   z.number().int().positive(),
  /** An `image` challenge's picture, PNG, base64: present when the challenge names the image's selector. */
  image:     z.string().optional(),
  /** The proxy of the access lease in use, when the solver was made with `sendProxy`: tokens are often tied to the IP that asked. */
  proxy:     z.strictObject({ server: z.string(), username: z.string().optional(), password: z.string().optional() }).optional(),
})
export type CaptchaCalloutInput = z.infer<typeof captchaCalloutInputSchema>

/**
 * What a captcha callout's `output` holds: a `token` for a widget (reCAPTCHA, hCaptcha, Turnstile), or the
 * `text` of an image captcha. OpenCraw puts it on the page; the service never touches the page.
 */
export const captchaCalloutOutputSchema = z.strictObject({
  token: z.string().min(1).optional(),
  text:  z.string().min(1).optional(),
}).refine(answer => answer.token !== undefined || answer.text !== undefined, { message: 'an answer needs a token or a text' })
export type CaptchaCalloutOutput = z.infer<typeof captchaCalloutOutputSchema>
