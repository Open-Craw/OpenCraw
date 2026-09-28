import { HStack, Text } from '@chakra-ui/react'
import type { SentencePart } from '@opencraw/studio'
import { Pill } from './pill'

/** A card's sentence, laid out inline: words as plain text, ids as pills, literals as code. */
export function SentenceView ({ parts }: { parts: SentencePart[] }) {
  return (
    <HStack gap={1} wrap='wrap' fontSize='sm'>
      {parts.map((part, index) => {
        const key = `${index}:${part.kind}:${part.text}`
        if (part.kind === 'pill') return <Pill key={key} name={part.text} />
        if (part.kind === 'code') return <Text key={key} as='code' fontFamily='mono' fontSize='xs' bg='bg.muted' px={1} borderRadius='sm'>{part.text}</Text>

        return <Text key={key} color='fg.muted'>{part.text}</Text>
      })}
    </HStack>
  )
}
