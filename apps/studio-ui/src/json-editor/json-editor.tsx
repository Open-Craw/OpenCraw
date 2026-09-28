import { useEffect, useState } from 'react'
import { Badge, Box, Button, Stack, Text, Textarea } from '@chakra-ui/react'
import type { RecipeListing } from '@opencraw/studio'

export interface JsonEditorProps {
  /** The selected recipe: its file, its text, and the issues the server's real loader found. `undefined` when none is selected. */
  recipe?: RecipeListing
  onSave:  (path: string, recipe: unknown) => Promise<void>
}

/**
 * The JSON tab: the selected recipe's file as text, editable, with a
 * "valid / N issues" indicator. Phase 0's validation is the server's own,
 * not a client-side copy of the JSON Schema: `open-workspace` already runs
 * `@opencraw/core`'s real parser and binder (the same one `opencraw validate`
 * uses) and returns each issue with its JSON path, so this shows that
 * instead of bundling core's schemas (and their Node-only dependencies)
 * into the browser. A plain `<textarea>` stands in for a schema-driven
 * editor with completion, which phase 0 does not need.
 */
export function JsonEditor ({ recipe, onSave }: JsonEditorProps) {
  const [text, setText] = useState(recipe?.text ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  useEffect(() => { setText(recipe?.text ?? '') }, [recipe?.file, recipe?.text])

  if (recipe === undefined) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>Select a recipe to see its JSON.</Text>
      </Box>
    )
  }

  const syntaxError = parseErrorOf(text)
  const dirty = text !== recipe.text

  const save = async (): Promise<void> => {
    if (syntaxError !== undefined) return
    setSaving(true)
    setSaveError(undefined)
    try {
      await onSave(recipe.file, JSON.parse(text))
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack h='full' p={2} gap={2}>
      <Stack direction='row' align='center' justify='space-between'>
        <Status issueCount={recipe.issues.length} syntaxError={syntaxError} />
        <Button size='sm' onClick={() => { void save() }} disabled={syntaxError !== undefined || saving || !dirty} loading={saving}>
          Save
        </Button>
      </Stack>
      {recipe.issues.length > 0 && syntaxError === undefined && (
        <Stack gap={0} fontSize='xs' color='fg.muted'>
          {recipe.issues.map(issue => (
            <Text key={`${issue.path}:${issue.message}`}>
              <Text as='span' fontFamily='mono'>{issue.path}</Text>: {issue.message}
            </Text>
          ))}
        </Stack>
      )}
      {saveError !== undefined && <Text color='fg.error' fontSize='sm'>{saveError}</Text>}
      <Textarea
        flex='1'
        fontFamily='mono'
        fontSize='sm'
        resize='none'
        value={text}
        onChange={event => { setText(event.target.value) }}
        spellCheck={false}
      />
    </Stack>
  )
}

function Status ({ issueCount, syntaxError }: { issueCount: number, syntaxError?: string }) {
  if (syntaxError !== undefined) return <Badge colorPalette='red'>invalid JSON: {syntaxError}</Badge>
  if (issueCount > 0) return <Badge colorPalette='orange'>{issueCount} issue{issueCount === 1 ? '' : 's'}</Badge>

  return <Badge colorPalette='green'>valid</Badge>
}

function parseErrorOf (text: string): string | undefined {
  try {
    JSON.parse(text)

    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
