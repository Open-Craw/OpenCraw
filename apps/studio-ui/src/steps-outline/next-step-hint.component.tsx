import { Box, List, Text } from '@chakra-ui/react'

/**
 * What a person who has just loaded something needs to be told, in plain words, while the recipe does not collect anything yet:
 * the steps below only open the source, so a run gives nothing. Shown at the top of the Steps tab until a value has been picked.
 */
export function NextStepHint (): React.ReactElement {
  return (
    <Box data-testid='next-step-hint' role='note' mb={3} p={3} borderWidth='1px' borderColor='brand.border' borderRadius='md' bg='brand.subtle'>
      <Text fontSize='sm' fontWeight='semibold' mb={1}>Nothing is collected yet</Text>
      <Text fontSize='sm' mb={1}>The steps below only open what you loaded. To collect data:</Text>
      <List.Root as='ol' ps={5} fontSize='sm' gap={0.5}>
        <List.Item>Pick what you want from the left. On a web page, click <b>Read</b> first, then click the text. In a table or a list of data, click the value.</List.Item>
        <List.Item>Pick two similar things (two product names, say) to collect the whole list.</List.Item>
        <List.Item>Press <b>Run sample</b> to see what comes out.</List.Item>
      </List.Root>
    </Box>
  )
}
