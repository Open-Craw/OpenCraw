import { useEffect, useState } from 'react'
import { Box, Text } from '@chakra-ui/react'
import type { OutlineView, RecipeListing } from '@opencraw/studio'
import { newStepNode } from './new-step.factory'
import type { OutlineActions } from './outline-actions'
import { OutlineList } from './outline-node'
import { listAt, listPathPrefix, withList, withNode } from './outline-tree'

export interface StepsOutlineProps {
  recipe?:       RecipeListing
  onSaveOutline: (path: string, outline: OutlineView) => Promise<void>
}

/**
 * The Steps tab: the selected recipe's `outline` (from `open-workspace`,
 * built server-side by `@opencraw/studio`'s `scope-outline` slice) as
 * cards and brackets. Local edits update this component's own state right
 * away (so typing and reordering feel instant); a structural change
 * (add/move/remove) and a "committed" field edit (a blur, a toggle) both go
 * through `save-outline`, after which the parent's usual reload
 * (`open-workspace` again) hands back the authoritative outline — the same
 * round trip `json-editor` already relies on for the JSON tab, so editing
 * either tab keeps the other one honest.
 */
export function StepsOutline ({ recipe, onSaveOutline }: StepsOutlineProps) {
  const [outline, setOutline] = useState<OutlineView | undefined>(recipe?.outline)
  useEffect(() => { setOutline(recipe?.outline) }, [recipe?.file, recipe?.text])

  if (recipe === undefined) {
    return <Box p={4} color='fg.muted'><Text>Select a recipe to see its steps.</Text></Box>
  }
  if (outline === undefined) {
    return <Box p={4} color='fg.muted'><Text>This recipe has no steps to show (not an input recipe, or its JSON is not an object).</Text></Box>
  }

  const save = (next: OutlineView): void => {
    setOutline(next)
    void onSaveOutline(recipe.file, next)
  }

  const actions: OutlineActions = {
    edit: (path, updater) => {
      setOutline(current => (current === undefined ? current : withNode(current, path, updater)))
    },
    commit: () => {
      setOutline(current => {
        if (current !== undefined) void onSaveOutline(recipe.file, current)

        return current
      })
    },
    move: (listId, index, direction) => {
      if (outline === undefined) return
      const list = listAt(outline, listId)
      const target = index + direction
      if (target < 0 || target >= list.length) return
      const reordered = [...list]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(target, 0, moved)
      save(withList(outline, listId, reordered))
    },
    remove: (listId, index) => {
      if (outline === undefined) return
      const list = listAt(outline, listId)
      save(withList(outline, listId, list.filter((_, position) => position !== index)))
    },
    insert: (listId, index, stepType) => {
      if (outline === undefined) return
      const list = listAt(outline, listId)
      const path = `${listPathPrefix(listId)}.${index}`
      const node = newStepNode(stepType, path)
      save(withList(outline, listId, [...list.slice(0, index), node, ...list.slice(index)]))
    },
  }

  return (
    <Box h='full' overflow='auto' p={2}>
      {/*
        Keyed on the recipe's own file: forces a fresh subtree (and so a
        fresh `StepForm`/TanStack Form instance per card) whenever the
        selected recipe changes, even when a step at the same tree position
        keeps the same `path` across recipes. Without this, `step-form.tsx`'s
        TanStack Form (whose values are seeded once, from `defaultValues`)
        would keep showing the previous recipe's field values for a card
        that never itself remounted.
      */}
      <OutlineList key={recipe.file} listId='' nodes={outline.steps} allIssues={recipe.issues} actions={actions} menuLabel='Add step' />
    </Box>
  )
}
