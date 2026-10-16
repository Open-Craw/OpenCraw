import { Button } from '@chakra-ui/react'
import { useColorMode } from './color-mode.hook'
import type { ColorModePreference } from './color-mode.store'

const NEXT: Record<ColorModePreference, ColorModePreference> = { system: 'light', light: 'dark', dark: 'system' }
const SHOWN: Record<ColorModePreference, { glyph: string, label: string }> = {
  system: { glyph: '◐', label: 'System' },
  light:  { glyph: '☀', label: 'Light' },
  dark:   { glyph: '☾', label: 'Dark' },
}

/** One button that steps through System → Light → Dark: it follows the system until the person picks a mode. */
export function ColorModeToggle () {
  const { preference, setPreference } = useColorMode()
  const { glyph, label } = SHOWN[preference]
  const next = SHOWN[NEXT[preference]].label

  return (
    <Button
      size='xs'
      variant='ghost'
      flexShrink={0}
      aria-label={`Theme: ${label}. Switch to ${next}`}
      title={`Theme: ${label}. Click for ${next}`}
      onClick={() => { setPreference(NEXT[preference]) }}
    >
      <span aria-hidden>{glyph}</span>
      {label}
    </Button>
  )
}
