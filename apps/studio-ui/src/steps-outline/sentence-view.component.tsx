import { HStack, Text } from '@chakra-ui/react'
import type { SentencePart } from '@opencraw/studio'
import { Pill } from './pill.component'

/**
 * A `code` sentence part whose text is a secret's own `{{env.NAME}}`
 * placeholder (`secret-field.policy.ts`'s `secretPlaceholder`): never the
 * real value — a secret field's value never reaches the recipe, a card, or
 * this component in the first place. Matched by shape here (not a flag
 * threaded down from wherever the part came from) so a recorded card and a
 * hand-authored or reloaded-from-disk one both get the same pill, issue #95's
 * "shows `{{env.NAME}}`… never the real value" holding regardless of where
 * the sentence part came from.
 */
const SECRET_PLACEHOLDER = /^\{\{env\.[A-Za-z_]\w*\}\}$/

/** A card's sentence, laid out inline: words as plain text, ids as pills, literals as code — a `{{env.NAME}}` literal as a distinct secret pill instead. */
export function SentenceView ({ parts }: { parts: SentencePart[] }) {
  return (
    <HStack gap={1} wrap='wrap' fontSize='sm'>
      {parts.map((part, index) => {
        const key = `${index}:${part.kind}:${part.text}`
        if (part.kind === 'pill') return <Pill key={key} name={part.text} />
        if (part.kind === 'code' && SECRET_PLACEHOLDER.test(part.text)) return <SecretPill key={key} placeholder={part.text} />
        if (part.kind === 'code') return <Text key={key} as='code' fontFamily='mono' fontSize='xs' bg='bg.muted' px={1} borderRadius='sm'>{part.text}</Text>

        return <Text key={key} color='fg.muted'>{part.text}</Text>
      })}
    </HStack>
  )
}

/**
 * The secret pill (issue #95): visually distinct from an ordinary id pill or
 * a plain code literal (a red, outlined, monospace pill), with a tooltip (the
 * native `title`, kept to "don't over-build this") naming the environment
 * variable to set before the recipe can run — never the value itself, which
 * this component never receives.
 */
function SecretPill ({ placeholder }: { placeholder: string }) {
  const envName = placeholder.slice('{{env.'.length, -2)

  return (
    <Text
      as='span'
      display='inline-block'
      px={2}
      py='1px'
      borderRadius='full'
      fontSize='xs'
      fontFamily='mono'
      fontWeight='medium'
      color='red.fg'
      bg='red.subtle'
      borderWidth='1px'
      borderColor='red.muted'
      title={`Never the real value — set the ${envName} environment variable before running this recipe.`}
    >
      {placeholder}
    </Text>
  )
}
