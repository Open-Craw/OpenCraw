import { NativeSelect } from '@chakra-ui/react'
import { NEW_STEP_OPTIONS } from './new-step.factory'

/** The `+` row between cards and at the end of a bracket: a native select doubling as a button, so it needs no extra dependency to place a dropdown. */
export function AddStepMenu ({ onAdd, ariaLabel }: { onAdd: (stepType: string) => void, ariaLabel: string }) {
  return (
    <NativeSelect.Root size='xs' width='9em' variant='outline'>
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
