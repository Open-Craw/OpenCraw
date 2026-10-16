import { Box, Text } from '@chakra-ui/react'

/** Shown above a page the Studio could not really see: a bot check or an access-denied page in place of the content. */
export function SnapshotNotice ({ text }: { text: string }): React.ReactElement {
  return (
    <Box px={3} py={2} bg='orange.subtle' borderBottomWidth='1px' flexShrink={0} role='status'>
      <Text fontSize='sm'>{text}</Text>
    </Box>
  )
}
