import { useState } from 'react'
import { Badge, Box, Button, HStack, IconButton, Input, NativeSelect, Stack, Text } from '@chakra-ui/react'
import type { FieldTraceView } from '@opencraw/studio'
import { optionFieldsOf, TRANSFORM_OPS } from './transform-op.catalog'

/** One transform of a mapping rule's chain, as plain JSON (`{ op, ...its own fields }`) — never `@opencraw/core`'s `TransformRule` type directly: the browser bundle only ever gets types from `@opencraw/studio`, not runtime code or types from `@opencraw/core` (see `studio-client/studio-client.ts`'s own doc comment on that boundary). */
export type TransformJson = Record<string, unknown> & { op: string }

export interface TransformChainProps {
  transforms: TransformJson[]
  /** The selected sample record's trace for this field, when there is one: `steps[i].value` is the real value after `transforms[i]` ran (studio plan §4.2's "the real value between each block"). */
  trace?:     FieldTraceView
  onChange:   (transforms: TransformJson[]) => void
}

/**
 * The transform-chain editor (issue #92): each block is one transform, with
 * add/remove/reorder and its own options inline; a hook (`op: 'hook'`) shows
 * only its name, never an options form (out of scope for this phase). When a
 * trace is given, each block shows the real value it produced on the last
 * sample's selected record right underneath it.
 */
export function TransformChain ({ transforms, trace, onChange }: TransformChainProps) {
  const [adding, setAdding] = useState(false)

  const update = (index: number, next: TransformJson): void => {
    onChange(transforms.map((transform, i) => (i === index ? next : transform)))
  }
  const remove = (index: number): void => { onChange(transforms.filter((_, i) => i !== index)) }
  const move = (index: number, by: -1 | 1): void => {
    const target = index + by
    if (target < 0 || target >= transforms.length) return
    const next = [...transforms]
    const swapped = next[index]
    next[index] = next[target]
    next[target] = swapped
    onChange(next)
  }
  const add = (op: string): void => {
    onChange([...transforms, { op }])
    setAdding(false)
  }

  return (
    <Stack direction='row' gap={2} wrap='wrap' align='flex-start'>
      {transforms.map((transform, index) => (
        <TransformBlock
          // eslint-disable-next-line @eslint-react/no-array-index-key -- transforms have no stable id of their own; reordering already replaces the whole array
          key={index}
          transform={transform}
          value={trace?.steps[index]?.value}
          failed={trace !== undefined && trace.steps.length <= index}
          onChange={next => { update(index, next) }}
          onRemove={() => { remove(index) }}
          onMoveLeft={index === 0 ? undefined : () => { move(index, -1) }}
          onMoveRight={index === transforms.length - 1 ? undefined : () => { move(index, 1) }}
        />
      ))}
      {adding
        ? (
            <NativeSelect.Root size='xs' width='140px'>
              <NativeSelect.Field
                defaultValue=''
                onChange={event => { if (event.target.value !== '') add(event.target.value) }}
              >
                <option value='' disabled>op…</option>
                {TRANSFORM_OPS.map(op => <option key={op} value={op}>{op}</option>)}
              </NativeSelect.Field>
            </NativeSelect.Root>
          )
        : <Button size='xs' variant='outline' onClick={() => { setAdding(true) }}>+ transform</Button>}
    </Stack>
  )
}

interface TransformBlockProps {
  transform:    TransformJson
  value?:       unknown
  /** `true` when the trace has fewer steps than this block's index needs: the chain stopped before reaching here (an earlier transform threw, or the engine reports no value at all). */
  failed:       boolean
  onChange:     (transform: TransformJson) => void
  onRemove:     () => void
  onMoveLeft?:  () => void
  onMoveRight?: () => void
}

function TransformBlock ({ transform, value, failed, onChange, onRemove, onMoveLeft, onMoveRight }: TransformBlockProps) {
  const [open, setOpen] = useState(false)
  const isHook = transform.op === 'hook'
  const fields = isHook ? [] : optionFieldsOf(transform.op)

  return (
    <Box borderWidth='1px' borderRadius='md' borderColor={failed ? 'red.subtle' : undefined} px={2} py={1} fontSize='xs'>
      <HStack gap={1}>
        {onMoveLeft !== undefined && <IconButton aria-label='Move left' size='2xs' variant='ghost' onClick={onMoveLeft}>‹</IconButton>}
        <Text
          as={isHook || fields.length === 0 ? 'span' : 'button'}
          fontWeight='medium'
          cursor={!isHook && fields.length > 0 ? 'pointer' : undefined}
          onClick={!isHook && fields.length > 0 ? () => { setOpen(!open) } : undefined}
        >
          {transform.op}{isHook && typeof transform.name === 'string' ? `: ${transform.name}` : ''}
        </Text>
        {onMoveRight !== undefined && <IconButton aria-label='Move right' size='2xs' variant='ghost' onClick={onMoveRight}>›</IconButton>}
        <IconButton aria-label={`Remove ${transform.op}`} size='2xs' variant='ghost' colorPalette='red' onClick={onRemove}>×</IconButton>
      </HStack>
      {value !== undefined && (
        <Badge mt={1} size='sm' colorPalette={failed ? 'red' : 'gray'} fontFamily='mono' maxW='160px' overflow='hidden' textOverflow='ellipsis'>
          → {typeof value === 'object' ? JSON.stringify(value) : String(value)}
        </Badge>
      )}
      {open && fields.length > 0 && (
        <Stack mt={1} gap={1}>
          {fields.map(field => (
            <HStack key={field.name} gap={1}>
              <Text color='fg.muted' minW='70px'>{field.name}</Text>
              <Input
                size='2xs'
                value={transform[field.name] === undefined ? '' : String(transform[field.name])}
                onChange={event => {
                  const raw = event.target.value
                  onChange({ ...transform, [field.name]: field.numeric ? Number(raw) : raw })
                }}
              />
            </HStack>
          ))}
        </Stack>
      )}
    </Box>
  )
}
