/** A version that does not exist, or a write to one that does. */
export class RecipeStoreError extends Error {
  constructor (message: string, readonly status: 404 | 409) {
    super(message)
    this.name = 'RecipeStoreError'
  }
}
