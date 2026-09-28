import { Box, HStack, Text, VStack } from '@chakra-ui/react'
import type { PageDataFindingView } from '@opencraw/studio'

export interface PageDataListProps {
  findings: PageDataFindingView[]
  /** Picks the finding's whole value (`key: undefined`), or one of its top-level `keys` (a `jsonpath` drill). */
  onPick:   (finding: PageDataFindingView, key: string | undefined) => void
}

/**
 * "Data in the page" (studio plan §3.3, issue #93): JSON-LD, `application/json`
 * scripts, inline state assignments, `<meta>` and `<link rel>`, apart from
 * the tree since none of them is normally visible on the rendered page.
 * Each is pickable as a whole; a JSON-shaped one also lists its top-level
 * keys, each pickable on its own (a `jsonpath` card drilling into it).
 */
export function PageDataList ({ findings, onPick }: PageDataListProps): React.ReactElement {
  if (findings.length === 0) {
    return <Box p={3} color='fg.muted' fontSize='sm'>No JSON-LD, inline state, meta or link data found in this page.</Box>
  }

  return (
    <VStack align='stretch' gap={0} fontSize='sm' overflow='auto' h='full'>
      {findings.map(finding => (
        <Box key={`${finding.kind}-${finding.selector}`} borderBottomWidth='1px' px={3} py={2}>
          <HStack justify='space-between' gap={2}>
            <Text fontWeight='medium' truncate>{finding.label}</Text>
            <Text as='button' flexShrink={0} fontSize='xs' color='blue.fg' onClick={() => { onPick(finding, undefined) }}>
              {finding.keys === undefined ? 'Read' : 'Read whole value'}
            </Text>
          </HStack>
          {finding.keys !== undefined && finding.keys.length > 0 && (
            <HStack wrap='wrap' gap={1} mt={1}>
              {finding.keys.map(key => (
                <Text
                  as='button'
                  key={key}
                  fontSize='xs'
                  px={2}
                  py='1px'
                  borderRadius='full'
                  borderWidth='1px'
                  onClick={() => { onPick(finding, key) }}
                >
                  {key}
                </Text>
              ))}
            </HStack>
          )}
        </Box>
      ))}
    </VStack>
  )
}
