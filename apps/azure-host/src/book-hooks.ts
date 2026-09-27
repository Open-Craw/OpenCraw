import type { HookMap } from '@opencraw/core'

/** The words books.toscrape.com puts in a rating's class (`star-rating Three`). */
const STARS: Record<string, number> = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5 }
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * The hooks the shipped recipes call. Hooks are code, so they live in the
 * host: a recipe names them, it never carries them.
 */
export const bookHooks: HookMap = {
  /** `"Three"` → 3. */
  stars:      input => (typeof input === 'string' ? STARS[input] : undefined),
  /** HTML entities in text a regex cut out of markup: `Shakespeare&#39;s` → `Shakespeare's`. */
  decodeHtml: input => (typeof input === 'string' ? input.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => decodeEntity(entity, code)) : input),
}

function decodeEntity (entity: string, code: string): string {
  if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
  if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)))

  return NAMED[code.toLowerCase()] ?? entity
}
