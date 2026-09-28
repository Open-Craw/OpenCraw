import { z } from 'zod'

/** One piece of a card's sentence: plain wording, a bound id (a "pill"), or a literal shown as code. Mirrors `scope-outline/outline.model.ts`'s `SentencePart`: the wire shape for the UI. */
export interface SentencePart {
  kind: 'word' | 'pill' | 'code'
  text: string
}

interface OutlineNodeBase {
  path:     string
  stepType: string
  sentence: SentencePart[]
  step:     Record<string, unknown>
}

/** A leaf step, read as a sentence (or, when `custom`, not read as one: the UI shows `step`'s raw JSON instead). */
export interface OutlineCard extends OutlineNodeBase {
  kind:   'card'
  custom: boolean
}

/** A container step (`forEach`, `paginate`, `if`), its body nested one level in. */
export interface OutlineBracket extends OutlineNodeBase {
  kind:          'bracket'
  stepType:      'forEach' | 'paginate' | 'if'
  children:      OutlineNode[]
  elseChildren?: OutlineNode[]
}

export type OutlineNode = OutlineCard | OutlineBracket

/** The outline the UI renders and edits: the recipe's other keys untouched, plus its steps as a tree. */
export interface OutlineView {
  recipe: Record<string, unknown>
  steps:  OutlineNode[]
}

export const sentencePartSchema: z.ZodType<SentencePart> = z.object({
  kind: z.enum(['word', 'pill', 'code']),
  text: z.string(),
})

const outlineNodeBase = {
  path:     z.string(),
  stepType: z.string(),
  sentence: z.array(sentencePartSchema),
  step:     z.record(z.string(), z.unknown()),
}

export const outlineCardSchema: z.ZodType<OutlineCard> = z.object({
  ...outlineNodeBase,
  kind:   z.literal('card'),
  custom: z.boolean(),
})

export const outlineBracketSchema: z.ZodType<OutlineBracket> = z.lazy(() => z.object({
  ...outlineNodeBase,
  kind:         z.literal('bracket'),
  stepType:     z.enum(['forEach', 'paginate', 'if']),
  children:     z.array(outlineNodeSchema),
  elseChildren: z.array(outlineNodeSchema).optional(),
}))

export const outlineNodeSchema: z.ZodType<OutlineNode> = z.union([outlineCardSchema, outlineBracketSchema])

export const outlineViewSchema: z.ZodType<OutlineView> = z.object({
  recipe: z.record(z.string(), z.unknown()),
  steps:  z.array(outlineNodeSchema),
})
