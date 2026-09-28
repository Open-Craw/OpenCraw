import { z } from 'zod'

/** The candidate tiers `selector-inference`'s ranking works through, best first — see `selector-candidates.algorithm.ts`. */
const candidateTierSchema = z.enum(['id', 'data-attr', 'class', 'structure', 'position'])

/** One clicked node's field: the best selector found for it, verified against the snapshot. */
export const fieldPickSchema = z.object({
  selector: z.string(),
  tier:     candidateTierSchema,
  take:     z.string(),
  matches:  z.number(),
})

/** A list's item shape: the best selector that matches every item, verified against the snapshot. */
const itemPickSchema = z.object({
  selector: z.string(),
  tier:     candidateTierSchema,
  matches:  z.number(),
})

/**
 * What `infer-selector` answers with (issue #91, studio plan §3.2):
 * `"field"` for one clicked node — a `Read` card's shape; `"list"` for two
 * similar nodes — the safe `extract`(items)+`forEach`(field) shape, item and
 * field each verified separately; `"unsupported"` when the two picks are not
 * a coherent list (different branches, the same node twice, or shadow DOM),
 * with a message the card can show as-is.
 */
export const inferSelectorViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('field'), field: fieldPickSchema }),
  z.object({ kind: z.literal('list'), item: itemPickSchema, field: fieldPickSchema }),
  z.object({ kind: z.literal('unsupported'), reason: z.string() }),
])

export type FieldPick = z.infer<typeof fieldPickSchema>
export type InferSelectorView = z.infer<typeof inferSelectorViewSchema>
