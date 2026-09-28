import { Text } from '@chakra-ui/react'
import { hashColor } from './hash-color'

/** One bound id or built-in, coloured by a stable hash of its name (see `hash-color.ts`). */
export function Pill ({ name }: { name: string }) {
  return (
    <Text as='span' display='inline-block' px={2} py='1px' borderRadius='full' fontSize='xs' fontWeight='medium' color='white' bg={hashColor(name)}>
      {name}
    </Text>
  )
}
