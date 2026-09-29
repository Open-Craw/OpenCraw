import { useState } from 'react'
import { Button, CloseButton, Dialog, Field, Input, Portal, Text } from '@chakra-ui/react'
import { useSaveRecipeMutation } from '../studio-client'
import { RECIPE_ID_PATTERN, newRecipeFiles } from './new-recipe.mapper'

export interface NewRecipeDialogProps {
  /** The open workspace folder the new files are written into; the button is disabled without one. */
  folder?:   string
  /** The new recipe's id was saved: select it (the same as picking it from the toolbar's recipe list). */
  onCreated: (recipeId: string) => void
}

/**
 * "+ New recipe" (issue #110): composes a minimal, valid `web` input/output
 * recipe pair from just an id, and saves both — the way to start a recipe
 * from scratch in a folder that has none yet (or add another to one that
 * already does). Reuses `saveRecipe`, the same use-case the JSON tab's Save
 * button calls; nothing server-side needed to know about "new" versus
 * "existing" (`fs.writeFile` already creates a file that is not there yet).
 */
export function NewRecipeDialog ({ folder, onCreated }: NewRecipeDialogProps) {
  const [open, setOpen] = useState(false)
  const [id, setId] = useState('')
  const [error, setError] = useState<string>()
  const saveRecipe = useSaveRecipeMutation()

  const idError = id.length === 0 ? undefined : idErrorFor(id)

  function reset (): void {
    setOpen(false)
    setId('')
    setError(undefined)
  }

  async function create (): Promise<void> {
    if (folder === undefined || idErrorFor(id) !== undefined) return
    setError(undefined)
    const files = newRecipeFiles(folder, id)
    try {
      await saveRecipe.mutateAsync({ path: files.outputPath, recipe: files.output })
      await saveRecipe.mutateAsync({ path: files.inputPath, recipe: files.input })
      onCreated(id)
      reset()
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : String(creationError))
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(details) => { if (details.open) setOpen(true); else reset() }}>
      <Dialog.Trigger asChild>
        <Button size='sm' variant='outline' disabled={folder === undefined}>+ New recipe</Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header display='flex' flexDirection='row' alignItems='center' justifyContent='space-between'>
              <Dialog.Title>New recipe</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size='sm' aria-label='Close' />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body display='flex' flexDirection='column' gap={3} pb={4}>
              <Field.Root invalid={idError !== undefined}>
                <Field.Label>Recipe id</Field.Label>
                <Input
                  size='sm'
                  placeholder='books'
                  value={id}
                  onChange={event => { setId(event.target.value) }}
                  onKeyDown={event => { if (event.key === 'Enter') void create() }}
                />
                {idError !== undefined && <Field.ErrorText>{idError}</Field.ErrorText>}
              </Field.Root>
              <Text fontSize='xs' color='fg.muted'>
                Writes <Text as='span' fontFamily='mono'>{id || '<id>'}.input.json</Text> and{' '}
                <Text as='span' fontFamily='mono'>{id || '<id>'}.output.json</Text> into the open folder: a `web` recipe with one
                page and no fields mapped yet, ready to build out in the Steps tab.
              </Text>
              {error !== undefined && <Text color='fg.error' fontSize='sm'>{error}</Text>}
              <Button
                size='sm'
                colorPalette='blue'
                alignSelf='flex-end'
                onClick={() => { void create() }}
                disabled={id.length === 0 || idError !== undefined || saveRecipe.isPending}
                loading={saveRecipe.isPending}
              >
                Create
              </Button>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function idErrorFor (id: string): string | undefined {
  return RECIPE_ID_PATTERN.test(id) ? undefined : 'lowercase letters, digits and hyphens, starting with a letter or digit'
}
