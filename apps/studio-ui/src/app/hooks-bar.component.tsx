import { Box } from '@chakra-ui/react'
import type { LoadedHooks } from '@opencraw/studio'

/**
 * The reminder that Studio runs the person's own code (issue #150): shown while it was started with
 * `opencraw studio --hooks <file>`, naming the file and the hooks it provides, so a sample run that
 * calls one is never a surprise. Nothing renders when no hooks were loaded.
 */
export function HooksBar ({ hooks }: { hooks: LoadedHooks | undefined }): React.JSX.Element | null {
  if (hooks === undefined) return null

  return (
    <Box px={4} py={1} bg='orange.subtle' color='orange.fg' fontSize='sm' data-testid='hooks-bar'>
      {`Hooks loaded from ${hooks.source} (runs as your code): ${hooks.names.length === 0 ? 'none exported' : hooks.names.join(', ')}`}
    </Box>
  )
}
