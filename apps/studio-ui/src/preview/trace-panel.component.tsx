import { Box, Text } from '@chakra-ui/react'

export interface TracePanelProps {
  /** The engine's `traceLine` output, in the order it arrived; appended live as a sample run proceeds. */
  lines: string[]
}

/** The Trace tab: the engine's own trace, streamed. */
export function TracePanel ({ lines }: TracePanelProps) {
  if (lines.length === 0) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>No trace yet. Run a sample to see it here.</Text>
      </Box>
    )
  }

  return (
    <Box as='pre' p={2} h='full' overflow='auto' fontFamily='mono' fontSize='xs' whiteSpace='pre-wrap'>
      {lines.join('\n')}
    </Box>
  )
}
