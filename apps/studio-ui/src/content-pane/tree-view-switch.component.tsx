import { Button, HStack } from '@chakra-ui/react'

export type TreeView = 'tree' | 'text'

/** Tree / Text: the same document as a tree to click values in, or as the text it is written in. */
export function TreeViewSwitch ({ value, onChange }: { value: TreeView, onChange: (view: TreeView) => void }): React.ReactElement {
  return (
    <HStack gap={0} role='group' aria-label='Show the document as' flexShrink={0}>
      <Button size='2xs' colorPalette='brand' variant={value === 'tree' ? 'solid' : 'outline'} aria-pressed={value === 'tree'} title='Click values to collect them' onClick={() => { onChange('tree') }}>Tree</Button>
      <Button size='2xs' colorPalette='brand' variant={value === 'text' ? 'solid' : 'outline'} aria-pressed={value === 'text'} title='The document as it is written' onClick={() => { onChange('text') }}>Text</Button>
    </HStack>
  )
}
