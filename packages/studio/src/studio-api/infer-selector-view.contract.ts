import { z } from 'zod'

/** The candidate tiers `selector-inference`'s ranking works through, best first — see `selector-candidates.algorithm.ts`. */
const candidateTierSchema = z.enum(['id', 'data-attr', 'class', 'structure', 'position'])

/** Another selector that reaches the clicked node, verified against the snapshot, for the person to choose instead of the best one. */
export const selectorAlternativeSchema = z.object({
  selector: z.string(),
  tier:     candidateTierSchema,
  matches:  z.number(),
})

/** One clicked node's field: the best selector found for it, verified against the snapshot. */
export const fieldPickSchema = z.object({
  selector:     z.string(),
  tier:         candidateTierSchema,
  take:         z.string(),
  matches:      z.number(),
  /** Every verified selector that reaches the node, best first (the chosen one among them), for the options the person is shown. */
  alternatives: z.array(selectorAlternativeSchema).optional(),
  /** The node's own id when it looks generated (so it is not used in any selector above), to tell the person why. */
  generatedId:  z.string().optional(),
})

/** A list's item shape: the best selector that matches every item, verified against the snapshot. */
const itemPickSchema = z.object({
  selector:     z.string(),
  tier:         candidateTierSchema,
  matches:      z.number(),
  alternatives: z.array(selectorAlternativeSchema).optional(),
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
  z.object({ kind: z.literal('item-field'), field: fieldPickSchema }),
  z.object({ kind: z.literal('unsupported'), reason: z.string() }),
])

export type SelectorAlternative = z.infer<typeof selectorAlternativeSchema>
export type FieldPick = z.infer<typeof fieldPickSchema>
export type InferSelectorView = z.infer<typeof inferSelectorViewSchema>
