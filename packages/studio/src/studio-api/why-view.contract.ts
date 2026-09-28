import { z } from 'zod'

/** What `explain-why` answers with: the sentence (`why-sentence.mapper.ts`'s `buildWhySentence`), plus the structured facts a click can act on — a link back to the step that bound the value, the policy that applied. */
export const whyViewSchema = z.object({
  sentence: z.string(),
  field:    z.string(),
  recipeId: z.string(),
  outcome:  z.enum(['missing', 'rejected']),
  /** The JSON path (`steps.2.steps.0`) of the step that bound the value's source id, when one was found in the recipe. */
  stepPath: z.string().optional(),
  /** The missing-value policy that applied (`nullable`, `default`, `null`, `fail`, `skip-record`), when one could be resolved. */
  policy:   z.string().optional(),
  /** The engine's own rejection reason, for a rejected record. */
  reason:   z.string().optional(),
})

export type WhyView = z.infer<typeof whyViewSchema>
