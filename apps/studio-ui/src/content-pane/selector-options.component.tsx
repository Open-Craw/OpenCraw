import { useState } from 'react'
import { Badge, Box, Button, HStack, Input, Stack, Text } from '@chakra-ui/react'
import type { SelectorAlternative } from '@opencraw/studio'
import { useVerifySelectorMutation } from '../studio-client'
import { tierLabel } from './selector-tier.mapper'

/** One group of choices: the selectors that reach the clicked element (or the items of a list), and the one chosen. */
export interface SelectorGroup {
  /** What the choice is for ("Selector", "Each item", "Value in each item"). */
  title:        string
  options:      readonly SelectorAlternative[]
  selected:     string
  onSelect:     (selector: string) => void
  /** The element's own id when it looks generated: said, so it is clear why no selector uses it. */
  generatedId?: string
}

export interface SelectorOptionsProps {
  recipeId: string
  stepPath: string
  /** The headline: what adding this will do. */
  heading:  string
  /** What a second click would do, or other help, in one line. */
  hint?:    string
  groups:   readonly SelectorGroup[]
  /** The text of the clicked element, so the person sees what they picked. */
  preview?: string
  /** Set when the chosen selector matches several elements: the person says whether to collect the first or all of them, as a list. */
  collect?: { matches: number, many: boolean, onChange: (many: boolean) => void }
  onAdd:    () => void
  onCancel: () => void
  adding?:  boolean
}

/**
 * What a click on a web page shows before anything is added to the recipe: the ways to reach what was clicked, so a person can choose one that will
 * keep working (classes and structure, say, instead of an id the site generates anew on every visit). Each way says how many elements it matches on
 * this page, the best is first and chosen, and a selector of their own can be typed and checked. Nothing changes the recipe until "Add to recipe".
 */
export function SelectorOptions ({ recipeId, stepPath, heading, hint, groups, preview, collect, onAdd, onCancel, adding = false }: SelectorOptionsProps): React.ReactElement {
  return (
    <Box data-testid='selector-options' borderWidth='1px' borderColor='colorPalette.muted' colorPalette='brand' bg='bg.subtle' rounded='md' mx={3} my={2} p={3} maxH='45%' overflowY='auto' flexShrink={0}>
      <HStack justify='space-between' align='start' gap={3}>
        <Box minW={0}>
          <Text fontSize='sm' fontWeight='semibold'>{heading}</Text>
          {preview !== undefined && preview !== '' && <Text fontSize='xs' color='fg.muted' truncate title={preview}>{`“${preview}”`}</Text>}
          {hint !== undefined && <Text fontSize='xs' color='fg.muted'>{hint}</Text>}
        </Box>
        <HStack flexShrink={0}>
          <Button size='xs' colorPalette='brand' onClick={onAdd} loading={adding}>Add to recipe</Button>
          <Button size='xs' variant='ghost' onClick={onCancel} aria-label='Cancel this pick'>Cancel</Button>
        </HStack>
      </HStack>
      <Stack gap={3} mt={2}>
        {groups.map(group => <OptionGroup key={group.title} recipeId={recipeId} stepPath={stepPath} group={group} />)}
        {collect !== undefined && <CollectChoice collect={collect} />}
      </Stack>
    </Box>
  )
}

/** The selector matches several elements: the first one is read, or every one, as a list (an array of values). */
function CollectChoice ({ collect }: { collect: { matches: number, many: boolean, onChange: (many: boolean) => void } }): React.ReactElement {
  return (
    <Stack gap={1} role='radiogroup' aria-label='What to collect'>
      <Text fontSize='xs' fontWeight='medium' color='fg.muted'>{`This matches ${String(collect.matches)} elements on the page. Collect:`}</Text>
      <Box as='label' display='flex' alignItems='center' gap={2} px={2} py={1} rounded='sm' cursor='pointer' bg={collect.many ? undefined : 'colorPalette.subtle'}>
        <input type='radio' name='collect-how-many' checked={!collect.many} onChange={() => { collect.onChange(false) }} />
        <Text fontSize='xs'>Only the first one</Text>
      </Box>
      <Box as='label' display='flex' alignItems='center' gap={2} px={2} py={1} rounded='sm' cursor='pointer' bg={collect.many ? 'colorPalette.subtle' : undefined}>
        <input type='radio' name='collect-how-many' checked={collect.many} onChange={() => { collect.onChange(true) }} />
        <Text fontSize='xs'>{`All ${String(collect.matches)}, as a list (an array of values)`}</Text>
      </Box>
    </Stack>
  )
}

function OptionGroup ({ recipeId, stepPath, group }: { recipeId: string, stepPath: string, group: SelectorGroup }): React.ReactElement {
  const known = group.options.some(option => option.selector === group.selected)

  return (
    <Stack gap={1} role='radiogroup' aria-label={group.title}>
      <Text fontSize='xs' fontWeight='medium' color='fg.muted'>{group.title}</Text>
      {group.generatedId !== undefined && (
        <Text fontSize='xs' color='orange.fg'>{`This element has the id “${group.generatedId}”, which looks generated, so it may change on the next visit and no option below uses it.`}</Text>
      )}
      {group.options.map((option, index) => (
        <Box
          key={option.selector}
          as='label'
          display='flex'
          alignItems='center'
          gap={2}
          px={2}
          py={1}
          rounded='sm'
          cursor='pointer'
          bg={option.selector === group.selected ? 'colorPalette.subtle' : undefined}
          _hover={{ bg: 'bg.emphasized' }}
        >
          <input type='radio' name={group.title} checked={option.selector === group.selected} onChange={() => { group.onSelect(option.selector) }} />
          <Text as='code' fontSize='xs' fontFamily='mono' truncate flex='1' minW={0} title={option.selector}>{option.selector}</Text>
          <Text fontSize='2xs' color='fg.muted' flexShrink={0}>{tierLabel(option.tier)}</Text>
          <Badge size='xs' flexShrink={0} colorPalette={option.matches === 1 ? 'green' : 'gray'}>{`${String(option.matches)} match${option.matches === 1 ? '' : 'es'}`}</Badge>
          {index === 0 && <Badge size='xs' colorPalette='brand' flexShrink={0}>suggested</Badge>}
        </Box>
      ))}
      <CustomSelector recipeId={recipeId} stepPath={stepPath} selected={known ? '' : group.selected} onUse={group.onSelect} />
    </Stack>
  )
}

/** A selector of the person's own: typed, checked against the page, and used. */
function CustomSelector ({ recipeId, stepPath, selected, onUse }: { recipeId: string, stepPath: string, selected: string, onUse: (selector: string) => void }): React.ReactElement {
  const [text, setText] = useState(selected)
  const verify = useVerifySelectorMutation()

  function use (): void {
    const selector = text.trim()
    if (selector === '') return
    onUse(selector)
    verify.mutate({ recipeId, path: stepPath, selector })
  }

  return (
    <HStack gap={2} px={2}>
      <Input size='xs' fontFamily='mono' value={text} placeholder='Or type your own selector, e.g. .price > span' aria-label='Your own selector' onChange={(event) => { setText(event.target.value) }} onKeyDown={(event) => { if (event.key === 'Enter') use() }} />
      <Button size='xs' variant='outline' onClick={use} loading={verify.isPending}>Use</Button>
      {verify.data !== undefined && <Badge size='xs' colorPalette={verify.data.snapshotMatches > 0 ? 'green' : 'red'}>{`${String(verify.data.snapshotMatches)} match${verify.data.snapshotMatches === 1 ? '' : 'es'}`}</Badge>}
    </HStack>
  )
}
