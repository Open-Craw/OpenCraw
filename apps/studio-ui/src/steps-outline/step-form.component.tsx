import { useState } from 'react'
import { Box, Checkbox, Field, Input, NativeSelect, Stack, Text, Textarea } from '@chakra-ui/react'
import { useForm } from '@tanstack/react-form'
import { STEP_FIELDS } from './step-field.catalog'
import type { FieldSpec } from './step-field.catalog'

export interface StepFormProps {
  stepType: string
  step:     Record<string, unknown>
  /** Called on every keystroke/toggle: the outline's local state, kept responsive. */
  onChange: (step: Record<string, unknown>) => void
  /** Called once an edit is "done" (a field loses focus, a toggle flips): writes through `save-outline`. */
  onCommit: () => void
}

/**
 * The card's expanded form: the fields `step-field.catalog.ts` knows for
 * this step type, plus an always-available "Advanced (JSON)" box for
 * everything else — the plan doc's "the sentence stays short; the details
 * are one click away", generated from a catalog rather than a live JSON
 * Schema read (see the catalog's own doc comment for why).
 *
 * TanStack Form (`useForm`) owns each catalog field's value/change/blur
 * plumbing; the Advanced box stays a plain buffered `<Textarea>` outside the
 * form, on purpose — it edits the *whole* step as raw JSON (arbitrary keys
 * the catalog does not know), which does not map onto named form fields.
 * `defaultValues` is seeded once, from `step`, when this component mounts:
 * `steps-outline.tsx` keys its outline tree on the selected recipe's file,
 * so switching recipes remounts every card's form with fresh values, rather
 * than this component trying to resync a form field mid-edit (which would
 * fight the very state it owns) whenever the `step` prop's identity changes
 * from the outline's own local, responsive edits.
 */
export function StepForm ({ stepType, step, onChange, onCommit }: StepFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const fields = STEP_FIELDS[stepType] ?? []
  const form = useForm({ defaultValues: step })

  return (
    <Stack gap={2} p={2} borderWidth='1px' borderRadius='md' bg='bg.subtle'>
      {fields.map(field => (
        <form.Field
          key={field.key}
          name={field.key}
          validators={{
            onMount:  ({ value }) => numberValidationError(field, value),
            onChange: ({ value }) => numberValidationError(field, value),
          }}
        >
          {(formField) => (
            <Stack gap={0}>
              <FieldControl
                field={field}
                value={formField.state.value}
                onChange={value => {
                  formField.handleChange(value)
                  onChange({ ...step, [field.key]: value })
                }}
                onCommit={() => { formField.handleBlur(); onCommit() }}
              />
              {formField.state.meta.errors.length > 0 && (
                <Text fontSize='xs' color='fg.error'>{String(formField.state.meta.errors[0])}</Text>
              )}
            </Stack>
          )}
        </form.Field>
      ))}
      {fields.length === 0 && <Text fontSize='xs' color='fg.muted'>No common fields for this step type; edit its JSON below.</Text>}
      <Box>
        <Text
          as='button'
          fontSize='xs'
          color='fg.muted'
          cursor='pointer'
          onClick={() => { setAdvancedOpen(open => !open) }}
        >
          {advancedOpen ? '▾' : '▸'} Advanced (JSON)
        </Text>
        {advancedOpen && <RawStepEditor step={step} onChange={onChange} onCommit={onCommit} />}
      </Box>
    </Stack>
  )
}

/**
 * A number field seeded from (or edited into) a non-number: a recipe file
 * hand-edited outside the studio, or a value the Advanced (JSON) box wrote.
 * `FieldControl`'s own number input always coerces through `numberOrUndefined`
 * before calling `onChange`, so this only ever fires for a value that
 * reached the form some other way.
 */
function numberValidationError (field: FieldSpec, value: unknown): string | undefined {
  return value !== undefined && typeof value !== 'number' && field.kind === 'number' ? 'must be a number' : undefined
}

function FieldControl ({ field, value, onChange, onCommit }: { field: FieldSpec, value: unknown, onChange: (value: unknown) => void, onCommit: () => void }) {
  if (field.kind === 'boolean') {
    return (
      <Checkbox.Root checked={value === true} onCheckedChange={details => { onChange(details.checked === true); onCommit() }}>
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label fontSize='sm'>{field.label}</Checkbox.Label>
      </Checkbox.Root>
    )
  }
  if (field.kind === 'enum') {
    return (
      <Field.Root>
        <Field.Label fontSize='xs'>{field.label}</Field.Label>
        <NativeSelect.Root size='sm'>
          <NativeSelect.Field value={typeof value === 'string' ? value : ''} onChange={event => { onChange(event.target.value === '' ? undefined : event.target.value); onCommit() }}>
            <option value=''>(default)</option>
            {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
          </NativeSelect.Field>
        </NativeSelect.Root>
      </Field.Root>
    )
  }
  if (field.kind === 'json') return <JsonFieldControl field={field} value={value} onChange={onChange} onCommit={onCommit} />

  return (
    <Field.Root>
      <Field.Label fontSize='xs'>{field.label}</Field.Label>
      <Input
        size='sm'
        type={field.kind === 'number' ? 'number' : 'text'}
        value={value === undefined ? '' : String(value)}
        onChange={event => { onChange(field.kind === 'number' ? numberOrUndefined(event.target.value) : event.target.value) }}
        onBlur={onCommit}
      />
    </Field.Root>
  )
}

function JsonFieldControl ({ field, value, onChange, onCommit }: { field: FieldSpec, value: unknown, onChange: (value: unknown) => void, onCommit: () => void }) {
  const [text, setText] = useState(() => stringify(value))

  return (
    <Field.Root>
      <Field.Label fontSize='xs'>{field.label}</Field.Label>
      <Input
        size='sm'
        fontFamily='mono'
        value={text}
        onChange={event => { setText(event.target.value) }}
        onBlur={() => { onChange(parseOrRaw(text)); onCommit() }}
      />
    </Field.Root>
  )
}

function RawStepEditor ({ step, onChange, onCommit }: { step: Record<string, unknown>, onChange: (step: Record<string, unknown>) => void, onCommit: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(step, null, 2))
  const [error, setError] = useState<string>()

  return (
    <Stack gap={1} mt={1}>
      <Textarea
        size='sm'
        fontFamily='mono'
        fontSize='xs'
        rows={6}
        aria-label='Advanced step JSON'
        value={text}
        onChange={event => { setText(event.target.value) }}
        onBlur={() => {
          try {
            const parsed: unknown = JSON.parse(text)
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('a step is a JSON object')
            setError(undefined)
            onChange(parsed as Record<string, unknown>)
            onCommit()
          } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : String(parseError))
          }
        }}
      />
      {error !== undefined && <Text fontSize='xs' color='fg.error'>{error}</Text>}
    </Stack>
  )
}

function numberOrUndefined (text: string): number | undefined {
  if (text === '') return undefined
  const value = Number(text)

  return Number.isNaN(value) ? undefined : value
}

function stringify (value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''

  return JSON.stringify(value)
}

function parseOrRaw (text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
