/** Whether `value` (a recipe's steps, nested ones included) holds an `emit` step: without one a run reads values and returns no record. */
export function hasEmitStep (value: unknown): boolean {
  if (Array.isArray(value)) return value.some(item => hasEmitStep(item))
  if (typeof value !== 'object' || value === null) return false
  const step = value as Record<string, unknown>
  if (step.type === 'emit') return true

  return Object.values(step).some(item => hasEmitStep(item))
}

/**
 * The recipe's steps with an `emit` appended.
 *
 * @param steps - The recipe's own `steps`; anything that is not an array counts as none.
 */
export function withEmitStep (steps: unknown): unknown[] {
  return [...(Array.isArray(steps) ? steps : []), { type: 'emit' }]
}
