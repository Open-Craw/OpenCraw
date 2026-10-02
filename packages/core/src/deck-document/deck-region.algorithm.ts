import { isInsideRegion } from '../pdf-document'
import type { DocumentRegion } from '../pdf-document'
import type { DeckDocument, DeckShape } from './deck-document.model'

/** What a region reads off one slide: the text, and the shapes it was read from (what a studio canvas highlights). */
export interface DeckRegionMatch {
  slide:  number
  text:   string
  shapes: DeckShape[]
}

/**
 * Reads a region off a deck: on each slide it names, the text boxes at
 * least half inside the box (the same rule a PDF region applies to cells,
 * `isInsideRegion`), in reading order, joined by a newline. A slide where
 * nothing sits in the box gives no match at all. `slide=*` reads every
 * visible slide, as `regex` over the deck's text does; a hidden slide is
 * read only when named by number.
 *
 * @param document - The read deck.
 * @param region - Where to read (`at` counts slides; points down from the slide's top-left corner, as the shapes are placed).
 * @returns One match per slide with text in the box, in slide order.
 */
export function deckRegionText (document: DeckDocument, region: DocumentRegion): DeckRegionMatch[] {
  const slides = region.at === '*' ? document.slides.filter(slide => !slide.hidden) : document.slides.filter(slide => slide.number === region.at)

  return slides.flatMap((slide) => {
    const shapes = slide.shapes.filter(shape => isInsideRegion(shape, region))
    if (shapes.length === 0) return []

    return [{ slide: slide.number, text: shapes.map(shape => shape.text).join('\n'), shapes }]
  })
}
