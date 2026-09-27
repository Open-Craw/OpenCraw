import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StoredRecipes } from '@opencraw/azure-durable'

/** A recipe set this deployment ships with: read-only, promoted, runnable by name. */
export type ShippedRecipes = Omit<StoredRecipes, 'state'>

const read = (directory: string, file: string): unknown => JSON.parse(readFileSync(join(directory, file), 'utf8'))

/**
 * The recipe sets in `assets/recipes`, by name and version. A change to a
 * recipe is a new version: pools running the old one keep it until they close.
 *
 * @param directory - Where the recipe files are.
 * @returns The sets.
 */
export function shippedRecipes (directory: string): ShippedRecipes[] {
  const book = read(directory, 'book.output.json')

  return [
    { name: 'books-by-category', version: '1', recipes: [book, read(directory, 'books-by-category.input.json')] },
    { name: 'catalogue', version: '1', recipes: [book, read(directory, 'catalogue.input.json')] },
  ]
}
