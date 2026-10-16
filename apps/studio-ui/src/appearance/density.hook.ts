import { useDensityStore } from './density.store'
import type { Density } from './density.store'

/** The spacing a density gives the recipe editor, in Chakra's own scale. */
export interface DensityMetrics {
  compact:    boolean
  /** Space between the cards of a list. */
  listGap:    number
  /** A card's inner padding. */
  cardPad:    number
  /** How far a bracket's steps are set in. */
  nestIndent: number
  /** The sentence's text size. */
  text:       'sm' | 'xs'
}

const METRICS: Record<Density, DensityMetrics> = {
  comfortable: { compact: false, listGap: 1, cardPad: 2, nestIndent: 8, text: 'sm' },
  compact:     { compact: true, listGap: 0.5, cardPad: 1, nestIndent: 4, text: 'xs' },
}

/** The density in force and the spacing that goes with it. */
export function useDensity (): DensityMetrics {
  return METRICS[useDensityStore(state => state.density)]
}
