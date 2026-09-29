import { useState } from 'react'
import { Badge, Box, Button, Checkbox, HStack, IconButton, Input, NativeSelect, Stack, Text } from '@chakra-ui/react'
import type { FieldTraceView } from '@opencraw/studio'
import { PILL_DRAG_MIME } from '../steps-outline'
import { FIELD_NAME_PATTERN, FIELD_TYPES, MISSING_POLICIES } from './field-spec.model'
import type { FieldSpecJson, FromRuleJson } from './field-spec.model'
import { TransformChain } from './transform-chain.component'

export interface FieldRowProps {
  /** The field's own local name (not the dotted path — a nested field's row still only edits its own segment). */
  name:               string
  field:              FieldSpecJson
  /** The mapping rule bound to this field's dotted path, or `undefined` when it is unmapped (`generated`, or simply not wired up yet). */
  rule?:              FromRuleJson
  /** Every id the Record tab's source dropdown offers (`scope-ids.algorithm.ts`), plus `generated: …` for a field the engine fills in itself. */
  scopeIds:           string[]
  /** The selected sample record's trace for this field, when it was mapped and a sample has run. */
  trace?:             FieldTraceView
  /** `true` when the selected record's value for this field is `null` (the missing-value policy applied) — the row's Why? affordance. */
  missing?:           boolean
  /** How many of the last sample's records this field rejected, and why (its most recent reason); `undefined` when none did. */
  rejected?:          { count: number, reason: string }
  depth?:             number
  /** This row's source step id — `rule.from` when it is a plain scope id (not a template or a list) — the cross-panel highlight key (issue #111); `undefined` when the row has no simple single-step source to highlight by. */
  stepId?:            string
  /** `true` when `stepId` is the studio's current cross-panel highlight (issue #111): hovering elsewhere lit this row up. */
  highlighted?:       boolean
  /** Hovering this row: `stepId` on enter, `undefined` on leave. Omitted (no hover wiring at all) when the row has no `stepId`. */
  onHoverStepId?:     (stepId: string | undefined) => void
  onFieldChange:      (field: FieldSpecJson) => void
  onRuleChange:       (rule: FromRuleJson | undefined) => void
  onRename:           (name: string) => void
  onRemove:           () => void
  onExplainMissing?:  () => void
  onExplainRejected?: () => void
}

/**
 * One row of the Record tab's fields table (issue #92, studio plan §4.2):
 * name, type, source (a dropdown of ids in scope, or a pill dropped from the
 * Steps tab), the transform chain with real trace values, key/required, and
 * an expanded row for `nullable`/`default`/`onMissing`/validation options.
 */
export function FieldRow ({ name, field, rule, scopeIds, trace, missing, rejected, depth = 0, stepId, highlighted = false, onHoverStepId, onFieldChange, onRuleChange, onRename, onRemove, onExplainMissing, onExplainRejected }: FieldRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [nameText, setNameText] = useState(name)
  const [nameError, setNameError] = useState<string>()
  const [dropHover, setDropHover] = useState(false)
  const generated = field.generated !== undefined

  const commitName = (): void => {
    if (nameText === name) return
    if (!FIELD_NAME_PATTERN.test(nameText)) {
      setNameError('a field name has no dots')

      return
    }
    setNameError(undefined)
    onRename(nameText)
  }

  return (
    <Box
      data-testid={`${name}-row`}
      data-highlighted={highlighted}
      borderWidth='1px'
      borderRadius='md'
      p={2}
      ml={depth * 5}
      borderColor={highlighted ? 'orange.solid' : (rejected === undefined ? undefined : 'red.subtle')}
      bg={highlighted ? 'orange.subtle' : undefined}
      onMouseEnter={stepId === undefined || onHoverStepId === undefined ? undefined : () => { onHoverStepId(stepId) }}
      onMouseLeave={stepId === undefined || onHoverStepId === undefined ? undefined : () => { onHoverStepId(undefined) }}
    >
      <HStack gap={2} align='center' wrap='wrap'>
        <Stack gap={0}>
          <Input size='xs' width='140px' value={nameText} onChange={event => { setNameText(event.target.value) }} onBlur={commitName} />
          {nameError !== undefined && <Text fontSize='2xs' color='fg.error'>{nameError}</Text>}
        </Stack>

        <NativeSelect.Root size='xs' width='110px'>
          <NativeSelect.Field value={field.type} onChange={event => { onFieldChange({ ...field, type: event.target.value }) }}>
            {FIELD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </NativeSelect.Field>
        </NativeSelect.Root>

        <Box
          data-testid={`${name}-source-drop`}
          minW='140px'
          borderWidth='1px'
          borderStyle='dashed'
          borderRadius='sm'
          px={2}
          py='2px'
          fontSize='xs'
          bg={dropHover ? 'colorPalette.subtle' : undefined}
          colorPalette='blue'
          onDragOver={event => {
            if (!event.dataTransfer.types.includes(PILL_DRAG_MIME)) {
              return
            }

            event.preventDefault(); setDropHover(true)
          }}
          onDragLeave={() => { setDropHover(false) }}
          onDrop={(event) => {
            event.preventDefault()
            setDropHover(false)
            const id = event.dataTransfer.getData(PILL_DRAG_MIME) || event.dataTransfer.getData('text/plain')
            if (id !== '') onRuleChange({ ...rule, from: id })
          }}
        >
          {generated
            ? <Text color='fg.muted'>generated: {field.generated}</Text>
            : (
                <NativeSelect.Root size='xs'>
                  <NativeSelect.Field
                    value={typeof rule?.from === 'string' ? rule.from : ''}
                    onChange={event => { onRuleChange(event.target.value === '' ? undefined : { ...rule, from: event.target.value }) }}
                  >
                    <option value=''>(drop a pill, or pick)</option>
                    {scopeIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </NativeSelect.Field>
                </NativeSelect.Root>
              )}
        </Box>

        <Checkbox.Root size='xs' checked={field.key === true} onCheckedChange={details => { onFieldChange({ ...field, key: details.checked === true }) }}>
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>key</Checkbox.Label>
        </Checkbox.Root>
        <Checkbox.Root size='xs' checked={field.required === true} disabled={generated} onCheckedChange={details => { onFieldChange({ ...field, required: details.checked === true }) }}>
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>required</Checkbox.Label>
        </Checkbox.Root>

        {missing === true && (
          <Button size='2xs' variant='outline' colorPalette='orange' onClick={onExplainMissing}>Why null?</Button>
        )}
        {rejected !== undefined && (
          <Button size='2xs' variant='outline' colorPalette='red' onClick={onExplainRejected} title={rejected.reason}>
            {rejected.count} rejected
          </Button>
        )}

        <Button size='2xs' variant='ghost' onClick={() => { setExpanded(!expanded) }}>{expanded ? 'less' : 'more'}</Button>
        <IconButton aria-label={`Remove ${name}`} size='2xs' variant='ghost' colorPalette='red' onClick={onRemove} ml='auto'>×</IconButton>
      </HStack>

      {!generated && field.type !== 'object' && (
        <Box mt={2}>
          <TransformChain
            transforms={rule?.transform ?? []}
            trace={trace}
            onChange={transforms => { onRuleChange(rule === undefined ? undefined : { ...rule, transform: transforms.length === 0 ? undefined : transforms }) }}
          />
        </Box>
      )}

      {expanded && (
        <Stack mt={2} direction='row' gap={3} wrap='wrap' fontSize='xs'>
          <Checkbox.Root size='xs' checked={field.nullable === true} onCheckedChange={details => { onFieldChange({ ...field, nullable: details.checked === true }) }}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>nullable</Checkbox.Label>
          </Checkbox.Root>
          <HStack gap={1}>
            <Text color='fg.muted'>onMissing</Text>
            <NativeSelect.Root size='xs' width='110px'>
              <NativeSelect.Field value={field.onMissing ?? ''} onChange={event => { onFieldChange({ ...field, onMissing: event.target.value === '' ? undefined : event.target.value }) }}>
                <option value=''>(recipe default)</option>
                {MISSING_POLICIES.map(policy => <option key={policy} value={policy}>{policy}</option>)}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </HStack>
          <HStack gap={1}>
            <Text color='fg.muted'>default</Text>
            <Input
              size='xs'
              width='120px'
              value={field.default === undefined ? '' : String(field.default)}
              onChange={event => { onFieldChange({ ...field, default: event.target.value === '' ? undefined : event.target.value }) }}
            />
          </HStack>
          {field.type === 'currency' && (
            <HStack gap={1}>
              <Text color='fg.muted'>currency</Text>
              <Input size='xs' width='60px' value={field.currency ?? ''} onChange={event => { onFieldChange({ ...field, currency: event.target.value || undefined }) }} />
            </HStack>
          )}
          {(field.type === 'date' || field.type === 'datetime') && (
            <HStack gap={1}>
              <Text color='fg.muted'>format</Text>
              <Input size='xs' width='100px' value={field.format ?? ''} onChange={event => { onFieldChange({ ...field, format: event.target.value || undefined }) }} />
            </HStack>
          )}
          {field.type === 'enum' && (
            <HStack gap={1}>
              <Text color='fg.muted'>values</Text>
              <Input
                size='xs'
                width='160px'
                placeholder='a, b, c'
                value={(field.values ?? []).join(', ')}
                onChange={event => { onFieldChange({ ...field, values: event.target.value.split(',').map(v => v.trim()).filter(v => v !== '') }) }}
              />
            </HStack>
          )}
          <HStack gap={1}>
            <Text color='fg.muted'>pattern</Text>
            <Input size='xs' width='120px' value={field.pattern ?? ''} onChange={event => { onFieldChange({ ...field, pattern: event.target.value || undefined }) }} />
          </HStack>
          <HStack gap={1}>
            <Text color='fg.muted'>min</Text>
            <Input size='xs' width='60px' value={field.min ?? ''} onChange={event => { onFieldChange({ ...field, min: event.target.value === '' ? undefined : Number(event.target.value) }) }} />
          </HStack>
          <HStack gap={1}>
            <Text color='fg.muted'>max</Text>
            <Input size='xs' width='60px' value={field.max ?? ''} onChange={event => { onFieldChange({ ...field, max: event.target.value === '' ? undefined : Number(event.target.value) }) }} />
          </HStack>
        </Stack>
      )}
    </Box>
  )
}

/** A small read-only badge for a `key`/`required` field, used by rows that only summarise a nested field rather than editing it fully. Exported for `record-editor.component.tsx`'s each-item header. */
export function FieldBadges ({ field }: { field: FieldSpecJson }) {
  return (
    <HStack gap={1}>
      {field.key === true && <Badge size='sm' colorPalette='purple'>key</Badge>}
      {field.required === true && <Badge size='sm' colorPalette='blue'>required</Badge>}
    </HStack>
  )
}
