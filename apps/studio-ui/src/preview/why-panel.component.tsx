import { Badge, Box, Spinner, Stack, Text } from '@chakra-ui/react'
import type { WhyView } from '@opencraw/studio'

export interface WhyPanelProps {
  /** Set once a missing or rejected cell has been clicked (`RecordsTable`'s `onCellClick`, `RejectedList`'s `onClick`); `undefined` before any click this session. */
  loading?: boolean
  view?:    WhyView
  error?:   string
}

/**
 * The Why? tab of the preview strip (studio plan §4.4, issue #92): the
 * sentence `explain-why` built from the last sample run's mapping trace,
 * step outcomes and missing-value policy, reachable by clicking a missing
 * (`null`) cell in the Records tab or an entry of the rejected list.
 */
export function WhyPanel ({ loading, view, error }: WhyPanelProps) {
  if (loading === true) {
    return (
      <Stack p={4} direction='row' align='center' color='fg.muted'>
        <Spinner size='sm' />
        <Text>Working it out…</Text>
      </Stack>
    )
  }
  if (error !== undefined) {
    return (
      <Box p={4}>
        <Text color='fg.error'>{error}</Text>
      </Box>
    )
  }
  if (view === undefined) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>Click a missing or rejected value in the Records tab to see why here.</Text>
      </Box>
    )
  }

  return (
    <Stack p={4} gap={2}>
      <Stack direction='row' gap={2} align='center'>
        <Badge colorPalette={view.outcome === 'rejected' ? 'red' : 'orange'}>{view.outcome}</Badge>
        <Text fontFamily='mono' fontSize='sm' fontWeight='medium'>{view.field}</Text>
      </Stack>
      <Text>{view.sentence}</Text>
      {view.policy !== undefined && <Text fontSize='xs' color='fg.muted'>policy: {view.policy}</Text>}
      {view.stepPath !== undefined && <Text fontSize='xs' color='fg.muted'>step: {view.stepPath}</Text>}
    </Stack>
  )
}
