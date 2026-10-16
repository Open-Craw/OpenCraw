import { Button, HStack } from '@chakra-ui/react'
import { useDensityStore } from './density.store'
import type { Density } from './density.store'

const CHOICES: { value: Density, label: string }[] = [
  { value: 'comfortable', label: 'Comfort' },
  { value: 'compact', label: 'Compact' },
]

/** Two buttons that set how much room the recipe editor takes. */
export function DensityToggle () {
  const density = useDensityStore(state => state.density)
  const setDensity = useDensityStore(state => state.setDensity)

  return (
    <HStack gap={0} role='group' aria-label='Editor density' flexShrink={0}>
      {CHOICES.map(choice => (
        <Button
          key={choice.value}
          size='2xs'
          colorPalette='brand'
          variant={density === choice.value ? 'solid' : 'outline'}
          aria-pressed={density === choice.value}
          onClick={() => { setDensity(choice.value) }}
        >
          {choice.label}
        </Button>
      ))}
    </HStack>
  )
}
