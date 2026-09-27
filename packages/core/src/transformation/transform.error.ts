/** A transform that could not be applied to its input. */
export class TransformError extends Error {
  override readonly name = 'TransformError'

  /**
   * @param op - The transform, or the field type a coercion reads it as.
   * @param reason - What went wrong, without the op.
   * @param input - The value it could not read.
   */
  constructor (readonly op: string, readonly reason: string, readonly input?: unknown) {
    super(`transform "${op}": ${reason}`)
  }
}
