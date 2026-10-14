import type { RecipeListing } from '@opencraw/studio'
import { DropdownMenu } from './dropdown-menu.component'
import type { DropdownItem } from './dropdown-menu.component'

export interface RecipeMenuProps {
  /** The input recipes in the open folder: opening one opens its output with it (the input names it). */
  inputs:            RecipeListing[]
  selectedRecipeId?: string
  /** A workspace folder is open: "New recipe…" needs somewhere to write. */
  hasFolder:         boolean
  onSelectRecipe:    (recipeId: string) => void
  onNewRecipe:       () => void
  onOpenFolder:      () => void
}

/**
 * "Recipe ▾": which recipe is being edited. Lists the recipes of the open
 * folder (each opens together with the output recipe it names), and starts a
 * new one or opens another folder. What the recipe reads is the Load menu's
 * job, not this one's.
 */
export function RecipeMenu ({ inputs, selectedRecipeId, hasFolder, onSelectRecipe, onNewRecipe, onOpenFolder }: RecipeMenuProps) {
  const recipes: DropdownItem[] = inputs.length === 0
    ? [{ label: hasFolder ? 'No recipes in this folder' : 'Open a folder first', onSelect: () => {}, disabled: true, heading: 'Open recipe' }]
    : inputs.map((input, index) => {
        const id = input.id ?? input.file

        return { label: id === selectedRecipeId ? `✓ ${id}` : id, onSelect: () => { onSelectRecipe(id) }, ...(index === 0 && { heading: 'Open recipe' }) }
      })

  return (
    <DropdownMenu
      label={selectedRecipeId === undefined ? 'Recipe ▾' : `Recipe: ${selectedRecipeId} ▾`}
      title='Open, create or switch the recipe being edited'
      items={[
        ...recipes,
        { label: 'New recipe…', onSelect: onNewRecipe, disabled: !hasFolder, divider: true },
        { label: 'Open folder…', onSelect: onOpenFolder },
      ]}
    />
  )
}
