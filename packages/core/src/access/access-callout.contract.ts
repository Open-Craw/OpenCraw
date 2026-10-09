import { z } from 'zod'
import { BLOCKABLE_RESOURCES } from './access-profile.contract'

const leaseRequestSchema = z.strictObject({
  profile: z.string(),
  country: z.string().optional(),
  sticky:  z.boolean().optional(),
  /** 1 for the first lease of a run, higher after a rotation. */
  attempt: z.number().int().positive(),
  /** The profile's `options`, every string rendered (so `{{env.X}}` is already the value). */
  options: z.record(z.string(), z.unknown()),
})

const leasePhaseSchema = z.strictObject({ phase: z.literal('lease'), nonce: z.string(), request: leaseRequestSchema })

const releasePhaseSchema = z.strictObject({
  phase:   z.literal('release'),
  /** The lease being given back: the profile, and whatever the lease answer's `session` was. */
  profile: z.string(),
  session: z.string().optional(),
})

/**
 * What an access callout's `input` holds. A lease is a new action every time, so `nonce` is new per lease
 * (and the same for every poll of one `pending` lease): two leases for the same recipe, profile and attempt
 * are two leases.
 */
export const accessCalloutInputSchema = z.discriminatedUnion('phase', [leasePhaseSchema, releasePhaseSchema])
export type AccessCalloutInput = z.infer<typeof accessCalloutInputSchema>

const stringMap = z.record(z.string(), z.string())

/**
 * What an access callout's `output` holds for a `lease`: how the run reaches the network. `release: true`
 * asks to be called again with `phase: "release"` when the run ends or rotates away.
 */
export const accessCalloutOutputSchema = z.strictObject({
  proxy:             z.strictObject({ server: z.string().min(1), username: z.string().optional(), password: z.string().optional(), bypass: z.string().optional() }).optional(),
  session:           z.string().optional(),
  headers:           stringMap.optional(),
  ignoreHTTPSErrors: z.boolean().optional(),
  blockResources:    z.array(z.enum(BLOCKABLE_RESOURCES)).optional(),
  cdp:               z.strictObject({ endpoint: z.string().min(1), headers: stringMap.optional() }).optional(),
  release:           z.boolean().optional(),
})
export type AccessCalloutOutput = z.infer<typeof accessCalloutOutputSchema>
