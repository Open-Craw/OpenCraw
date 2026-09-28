import { Box, Text, VStack } from '@chakra-ui/react'
import type { ObservedResponseView } from '@opencraw/studio'

export interface ResponsesSeenListProps {
  responses?: ObservedResponseView[]
  loading:    boolean
  error?:     string
  onCheck:    () => void
  /** Picking a response switches the recipe to api mode on that endpoint (issue #93's acceptance). */
  onPick:     (response: ObservedResponseView) => void
}

/**
 * "Responses seen" (studio plan §3.3, issue #93): the JSON responses the
 * page fetched while it rendered. Capturing opens its own browser session
 * (`responses-seen.use-case.ts`) and takes a few seconds, so this only fires
 * on "Check", never automatically. Picking one switches the recipe to api
 * mode on that endpoint; the JSON tree canvas for field picks from the
 * fetched shape is phase 5's (not built here — see this phase's final report).
 */
export function ResponsesSeenList ({ responses, loading, error, onCheck, onPick }: ResponsesSeenListProps): React.ReactElement {
  return (
    <VStack align='stretch' gap={2} p={3} fontSize='sm' overflow='auto' h='full'>
      <Text
        as='button'
        alignSelf='flex-start'
        colorPalette='blue'
        color='colorPalette.fg'
        fontWeight='medium'
        opacity={loading ? 0.6 : 1}
        pointerEvents={loading ? 'none' : undefined}
        onClick={onCheck}
      >
        {loading ? 'Checking…' : 'Check for JSON responses'}
      </Text>
      {error !== undefined && <Text color='red.fg'>{error}</Text>}
      {responses !== undefined && responses.length === 0 && <Text color='fg.muted'>No JSON responses seen while the page rendered.</Text>}
      {responses?.map(response => (
        <Box key={response.url} borderWidth='1px' borderRadius='md' p={2}>
          <Text fontWeight='medium' truncate title={response.url}>{response.url}</Text>
          <Text color='fg.muted' fontSize='xs'>{`${response.status} · ${response.size} bytes · ${response.shape}`}</Text>
          <Text as='button' fontSize='xs' color='blue.fg' mt={1} onClick={() => { onPick(response) }}>
            Switch to api mode on this endpoint
          </Text>
        </Box>
      ))}
    </VStack>
  )
}
