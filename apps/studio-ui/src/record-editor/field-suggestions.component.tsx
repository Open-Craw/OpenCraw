import { Badge, Box, Button, HStack, Stack, Text } from '@chakra-ui/react'
import { Pill } from '../steps-outline'
import { typeColor } from './field-type-color.mapper'
import type { FieldSuggestion } from './suggest-fields.algorithm'

export interface FieldSuggestionsProps {
  suggestions: FieldSuggestion[]
  /** Adds one proposal: its field and the rule that reads its pill. */
  onAdd:       (suggestion: FieldSuggestion) => void
  onAddAll:    () => void
}

/**
 * What the steps read that no output field uses yet, one chip each: the pill,
 * the field it would become and its guessed type. A click adds the field and
 * its mapping in one go, so building the output is picking, not typing.
 * Renders nothing when everything read is already used.
 */
export function FieldSuggestions ({ suggestions, onAdd, onAddAll }: FieldSuggestionsProps) {
  if (suggestions.length === 0) return null

  return (
    <Box data-testid='field-suggestions' borderWidth='1px' borderStyle='dashed' borderRadius='md' p={2} bg='bg.subtle'>
      <HStack justify='space-between' mb={1}>
        <Text fontSize='xs' fontWeight='medium'>Read by the steps, not in the output yet</Text>
        <Button size='2xs' variant='outline' onClick={onAddAll}>Add all ({suggestions.length})</Button>
      </HStack>
      <Stack direction='row' wrap='wrap' gap={2}>
        {suggestions.map(suggestion => (
          <HStack
            key={suggestion.source}
            data-testid={`suggestion-${suggestion.source}`}
            gap={1}
            borderWidth='1px'
            borderRadius='full'
            pl={1}
            pr={1}
            py='1px'
            bg='bg'
            title={`${suggestion.name}: ${suggestion.field.type}, because ${suggestion.reason}`}
          >
            <Pill name={suggestion.source} draggable={false} />
            <Text fontSize='xs' color='fg.muted'>→</Text>
            <Text fontSize='xs' fontWeight='medium'>{suggestion.name}</Text>
            <Badge size='sm' colorPalette={typeColor(suggestion.field.type)}>{suggestion.field.type}</Badge>
            <Button size='2xs' variant='ghost' aria-label={`Add ${suggestion.name}`} onClick={() => { onAdd(suggestion) }}>＋</Button>
          </HStack>
        ))}
      </Stack>
    </Box>
  )
}
