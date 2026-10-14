import { Text } from '@chakra-ui/react'
import { useIsMutating } from '@tanstack/react-query'

/** Edits are written as they are made; this says so, and says when a write is still on its way. */
export function SaveStatus () {
  const writing = useIsMutating() > 0

  return (
    <Text role='status' fontSize='sm' color='fg.muted' flexShrink={0}>
      {writing ? 'Saving…' : 'All changes saved'}
    </Text>
  )
}
