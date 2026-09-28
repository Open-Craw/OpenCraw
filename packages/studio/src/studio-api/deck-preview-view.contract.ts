import { z } from 'zod'

const deckPreviewRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

/** One table matched by a `table` extract's options against a deck — mirrors `@opencraw/core`'s `DeckTable`. */
export const deckTablePreviewMatchSchema = z.object({
  slide:      z.number().int(),
  slideTitle: z.string(),
  title:      z.string(),
  header:     z.array(z.string()),
  rows:       z.array(deckPreviewRowSchema),
})

/**
 * What `deck-preview` answers with (studio plan §3.4, issue #94's 5d: the
 * live preview): every matched table, or `error` when a pattern in the
 * options does not compile — expected while the person is still typing it,
 * not thrown.
 */
export const deckTablePreviewViewSchema = z.object({
  matches: z.array(deckTablePreviewMatchSchema),
  error:   z.string().optional(),
})

export type DeckTablePreviewMatchView = z.infer<typeof deckTablePreviewMatchSchema>
export type DeckTablePreviewView = z.infer<typeof deckTablePreviewViewSchema>
