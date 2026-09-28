/**
 * Which class tokens are worth building a selector on. A hand-authored class
 * (`product_pod`, `price_color`) survives a rebuild; a generated one
 * (a content hash, a CSS-module suffix, a styled-components token) does not,
 * so a candidate built on it looks fine on the snapshot it was picked from
 * and breaks on the very next deploy. This is the "generated/hashed class
 * names" tradeoff issue #91 calls out explicitly: the heuristics below are a
 * reasoned judgement call, not a guarantee — see the doc comments on each
 * pattern for what real-world tool it targets.
 */

const GENERATED_TOKEN_PATTERNS: RegExp[] = [
  /** styled-components / emotion: `sc-bdVaJa`, `css-1x2y3z4` */
  /^(?:sc|css)-[a-z0-9]+$/i,
  /** CSS Modules, most bundlers' default hash suffix: `wrapper__3fA9k`, `Button-module_root__aB3dK` */
  /__[a-z0-9]{4,10}$/i,
  /** JSS / MUI: `jss123`, `MuiButton-root-145` */
  /^(?:jss|mui[a-z]*-)[a-z0-9-]*\d{2}$/i,
  /** A token that is only digits: not a class a human would type. */
  /^\d+$/,
  /** A bare hex hash: `a3f9c21`, `1a2b3c4d` (6+ hex chars, nothing else). */
  /^[0-9a-f]{6,}$/i,
  /** Tailwind/atomic-CSS-in-JS runtime classes some bundlers emit: `_1a2b3c` */
  /^_[0-9a-z]{5,}$/i,
]

/**
 * Whether a class token looks hand-authored and safe to build a selector on.
 *
 * @param token - One class, no surrounding whitespace.
 * @returns `false` for anything matching a known generated-class shape.
 */
export function isStableClassToken (token: string): boolean {
  return token.length > 0 && GENERATED_TOKEN_PATTERNS.every(pattern => !pattern.test(token))
}

/**
 * The subset of `tokens` worth ranking a selector candidate on, order kept.
 *
 * @param tokens - An element's class list.
 * @returns Only the stable tokens.
 */
export function stableClasses (tokens: readonly string[]): string[] {
  return tokens.filter(token => isStableClassToken(token))
}

/**
 * Whether two class lists describe "the same kind of element" for list
 * inference: same stable classes, generated tokens (which often differ
 * per-instance, e.g. a React `key`-derived class) ignored on both sides.
 *
 * @param a - One element's classes.
 * @param b - Another element's classes.
 * @returns Whether their stable class sets are equal, order ignored.
 */
export function sameClassSignature (a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(stableClasses(a))
  const right = new Set(stableClasses(b))
  if (left.size !== right.size) return false

  return [...left].every(token => right.has(token))
}
