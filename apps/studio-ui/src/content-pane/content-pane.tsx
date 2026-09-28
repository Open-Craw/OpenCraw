import { Box, Code, Text } from '@chakra-ui/react'

export interface ContentPaneProps {
  /** The fetched or rendered HTML of the recipe's start page, as plain text. `undefined` before a fetch. */
  html?: string
}

/**
 * The content pane: the raw HTML (or JSON, for an api recipe) the engine
 * fetched, as read-only text. No rewriting, no picking yet: that is phase 2
 * (`page-snapshot`, #91). A `<pre>`-like code view is enough for phase 0.
 */
export function ContentPane ({ html }: ContentPaneProps) {
  if (html === undefined) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>Run a sample, or fetch the start page, to see what the engine reads here.</Text>
      </Box>
    )
  }

  return (
    <Box as='pre' p={4} h='full' overflow='auto' fontSize='sm' whiteSpace='pre-wrap' wordBreak='break-word'>
      <Code display='block' bg='transparent' p={0} whiteSpace='pre-wrap'>
        {html}
      </Code>
    </Box>
  )
}
