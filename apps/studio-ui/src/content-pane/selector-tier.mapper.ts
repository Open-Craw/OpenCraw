import type { SelectorAlternative } from '@opencraw/studio'

const LABELS: Record<SelectorAlternative['tier'], string> = {
  'id':        'by id',
  'data-attr': 'by test attribute',
  'class':     'by class',
  'structure': 'by place in the page tree',
  'position':  'by position',
}

/**
 * How a selector's kind is said to a person who has never read a stylesheet.
 *
 * @param tier - The tier the server ranked the selector in.
 * @returns A short phrase.
 */
export function tierLabel (tier: SelectorAlternative['tier']): string {
  return LABELS[tier]
}
