import { Input, NativeSelect, Text } from '@chakra-ui/react'
import { useHookNames } from './hook-names.hook'

export interface HookNameFieldProps {
  value:     string
  onChange:  (name: string) => void
  /** Called once the name is settled: a choice from the list, or a text field losing focus. */
  onCommit?: () => void
  size?:     'xs' | 'sm'
  ariaLabel: string
}

/**
 * Where a recipe names a hook: a list of the hooks Studio loaded when it has any, so the name cannot
 * be misspelled; otherwise a text field, with the way to get the list. A name the recipe already has
 * that is not among the loaded hooks stays selectable and is marked, never silently replaced.
 */
export function HookNameField ({ value, onChange, onCommit, size = 'sm', ariaLabel }: HookNameFieldProps) {
  const names = useHookNames()
  const settle = (): void => { onCommit?.() }

  if (names === undefined || names.length === 0) {
    return (
      <>
        <Input size={size} aria-label={ariaLabel} value={value} onChange={event => { onChange(event.target.value) }} onBlur={settle} />
        <Text fontSize='xs' color='fg.muted'>
          {names === undefined ? 'Studio has no hooks loaded: restart it with `opencraw studio --hooks <file>` to pick from a list.' : 'The hooks file exports no hooks.'}
        </Text>
      </>
    )
  }
  const unknown = value !== '' && !names.includes(value)

  return (
    <NativeSelect.Root size={size}>
      <NativeSelect.Field
        aria-label={ariaLabel}
        value={value}
        onChange={event => { onChange(event.target.value); settle() }}
      >
        <option value='' disabled>(choose a hook)</option>
        {unknown && <option value={value}>{`${value} (not in the loaded hooks)`}</option>}
        {names.map(name => <option key={name} value={name}>{name}</option>)}
      </NativeSelect.Field>
    </NativeSelect.Root>
  )
}
