/** A named, versioned recipe set: its output recipe and its input recipes. */
export interface StoredRecipes {
  name:    string
  /** Any string: `3`, `2026-09-27`. A version, once written, never changes. */
  version: string
  /** The recipes as JSON objects: one output recipe and its input recipes, in any order. */
  recipes: unknown[]
  /** A draft can be tried, but production routes (`/crawl` by name, `/jobs`) refuse it. */
  state:   'draft' | 'promoted'
}

/** Where the host finds named recipes. */
export interface RecipeStore {
  get (name: string, version: string): Promise<StoredRecipes | undefined>
  list (): Promise<Omit<StoredRecipes, 'recipes'>[]>
  /**
   * Saves a new version as a draft.
   *
   * @throws Error when that version exists: versions never change.
   */
  put (entry: Omit<StoredRecipes, 'state'>): Promise<void>
  /**
   * Makes a draft runnable in production.
   *
   * @throws Error when there is no such version.
   */
  promote (name: string, version: string): Promise<void>
}
