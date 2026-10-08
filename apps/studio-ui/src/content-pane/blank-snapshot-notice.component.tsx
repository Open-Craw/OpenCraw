import { Box, Text } from '@chakra-ui/react'

/**
 * Shown above a snapshot with almost nothing visible in it (issue #135): most
 * likely a page that builds its content with JavaScript, fetched without a
 * browser, so there is little here to click.
 */
export function BlankSnapshotNotice (): React.ReactElement {
  return (
    <Box px={3} py={2} bg='orange.subtle' borderBottomWidth='1px' flexShrink={0} role='status'>
      <Text fontSize='sm'>
        This page shows almost nothing. If it should have content, it builds it with JavaScript and the engine fetched it without a browser. Use Inspect to see the data it loads.
      </Text>
    </Box>
  )
}
