import { NativeSelect } from '@chakra-ui/react'
import { useDensity } from '../appearance'
import { NEW_STEP_OPTIONS } from './new-step.factory'

/** The `+` row between cards and at the end of a bracket: a native select doubling as a button, so it needs no extra dependency to place a dropdown. */
export function AddStepMenu ({ onAdd, ariaLabel }: { onAdd: (stepType: string) => void, ariaLabel: string }) {
  const { compact } = useDensity()

  return (
    <NativeSelect.Root size='xs' width={compact ? '7em' : '9em'} variant='outline' opacity={compact ? 0.55 : 1} _hover={{ opacity: 1 }} _focusWithin={{ opacity: 1 }}>
      <NativeSelect.Field
        aria-label={ariaLabel}
        value=''
        onChange={(event) => {
          const stepType = event.target.value
          if (stepType !== '') onAdd(stepType)
          event.target.value = ''
        }}
      >
        <option value='' disabled>+ Add step</option>
        {NEW_STEP_OPTIONS.map(option => <option key={option.stepType} value={option.stepType}>{option.label}</option>)}
      </NativeSelect.Field>
    </NativeSelect.Root>
  )
}
