import { HStack, Image, Text } from '@chakra-ui/react'

/** The OpenCraw mark and the studio's name, at the toolbar's left edge. */
export function StudioLogo () {
  return (
    <HStack gap={2} flexShrink={0}>
      <Image src='/opencraw-logo.svg' alt='OpenCraw' h='28px' w='auto' />
      <Text fontWeight='semibold' letterSpacing='tight'>OpenCraw Studio</Text>
    </HStack>
  )
}
