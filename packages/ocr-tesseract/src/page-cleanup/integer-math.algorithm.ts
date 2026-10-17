/* eslint-disable unicorn/prefer-math-min-max, unicorn/prefer-math-trunc -- see below: these helpers exist to not call Math.* */
/**
 * The few arithmetic helpers the per-pixel loops use. They are plain comparisons and bit operations on purpose: a call to `Math.min`, `Math.max`,
 * `Math.floor` or `Math.round` is about a hundred times slower inside a sandboxed test runner than in Node (measured: 150 ns against 1 ns), and these
 * loops make tens of millions of them a page. With these the cleanup of a page takes a third of a second under the test runner, not fifteen seconds.
 * Written as `Math.*` the rules above would be right; do not "simplify" them.
 */

/** The smaller of two numbers. */
export function lowerOf (a: number, b: number): number {
  return a < b ? a : b
}

/** The larger of two numbers. */
export function higherOf (a: number, b: number): number {
  return a > b ? a : b
}

/** A number held between two limits. */
export function clampedTo (value: number, low: number, high: number): number {
  if (value < low) return low
  if (value > high) return high

  return value
}

/** A non-negative number rounded to the nearest integer (halves up), as `Math.round` does for it. */
export function roundedUp (value: number): number {
  return (value + 0.5) | 0
}

/** A non-negative number with its fraction dropped, as `Math.floor` does for it. */
export function wholePartOf (value: number): number {
  return value | 0
}
