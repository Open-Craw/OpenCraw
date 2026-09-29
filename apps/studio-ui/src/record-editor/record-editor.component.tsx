import { useEffect, useState } from 'react'
import { Box, Button, HStack, Input, NativeSelect, Stack, Text } from '@chakra-ui/react'
import type { FieldTraceView, RecipeListing } from '@opencraw/studio'
import type { PreviewRecord } from '../preview'
import type { RejectedRecord } from '../studio-store'
import { useStudioUiStore } from '../studio-store'
import { FieldRow } from './field-row.component'
import type { FieldSpecJson, MappingRuleJson } from './field-spec.model'
import { isEachRule, MISSING_POLICIES } from './field-spec.model'
import { scopeIdsOf } from './scope-ids.algorithm'

export interface RecordEditorProps {
  /** The selected input recipe (its `mapping`), or `undefined` before one is selected. */
  inputRecipe?:       RecipeListing
  /** The paired output recipe (its `fields`/`onMissing`), found by `input.output` — `undefined` when the workspace has none by that id yet. */
  outputRecipe?:      RecipeListing
  /** The last sample run's records, for the transform chain's real values and the missing/rejected state (`run-session.store.ts`). */
  records:            PreviewRecord[]
  rejected:           RejectedRecord[]
  onSaveInput:        (path: string, recipe: unknown) => Promise<void>
  onSaveOutput:       (path: string, recipe: unknown) => Promise<void>
  onExplainMissing?:  (recordIndex: number, field: string) => void
  onExplainRejected?: (rejectedIndex: number) => void
}

interface OutputRecipeJson {
  fields:        Record<string, FieldSpecJson>
  onMissing?:    string
  [key: string]: unknown
}

interface InputRecipeJson {
  mapping:       Record<string, MappingRuleJson>
  [key: string]: unknown
}

/**
 * The Record tab (issue #92, studio plan §4.2): the output recipe's fields
 * and the input recipe's mapping, edited together and saved back through the
 * same `save-recipe` command the JSON tab uses (both round-trip the same
 * way: `recipe-workspace/save-recipe.use-case.ts` is a full-object write for
 * any recipe file, input or output alike — nothing output-recipe-specific
 * was needed here, see this feature's own investigation note in the phase's
 * hand-back report).
 */
export function RecordEditor ({ inputRecipe, outputRecipe, records, rejected, onSaveInput, onSaveOutput, onExplainMissing, onExplainRejected }: RecordEditorProps) {
  const [output, setOutput] = useState<OutputRecipeJson>()
  const [input, setInput] = useState<InputRecipeJson>()
  /** `JSON.stringify` of `output`/`input` right after the last load or save, for `dirty` below: `outputRecipe.text`/`inputRecipe.text` are pretty-printed, `JSON.stringify(output)` is not, so comparing against the raw text directly would read as "dirty" the instant a recipe is opened. */
  const [savedOutputJson, setSavedOutputJson] = useState<string>()
  const [savedInputJson, setSavedInputJson] = useState<string>()
  const [recordIndex, setRecordIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const hoveredStepId = useStudioUiStore(state => state.hoveredStepId)
  const setHoveredStepId = useStudioUiStore(state => state.setHoveredStepId)

  useEffect(() => {
    const nextOutput = outputRecipe === undefined ? undefined : (JSON.parse(outputRecipe.text) as OutputRecipeJson)
    const nextInput = inputRecipe === undefined ? undefined : (JSON.parse(inputRecipe.text) as InputRecipeJson)
    setOutput(nextOutput)
    setInput(nextInput)
    setSavedOutputJson(nextOutput === undefined ? undefined : JSON.stringify(nextOutput))
    setSavedInputJson(nextInput === undefined ? undefined : JSON.stringify(nextInput))
    setRecordIndex(0)
    // Only when the underlying files change identity (a different recipe selected, or a save landed) — not on every local edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRecipe?.file, inputRecipe?.text, outputRecipe?.file, outputRecipe?.text])

  if (inputRecipe === undefined) {
    return <Box p={4} color='fg.muted'><Text>Select a recipe to see its output fields.</Text></Box>
  }
  if (outputRecipe === undefined || output === undefined || input === undefined) {
    return <Box p={4} color='fg.muted'><Text>This recipe names no output recipe found in this workspace.</Text></Box>
  }

  const scopeIds = scopeIdsOf(input)
  const record = records[recordIndex] as PreviewRecord | undefined
  const dirty = JSON.stringify(output) !== savedOutputJson || JSON.stringify(input) !== savedInputJson

  const setField = (name: string, next: FieldSpecJson | undefined): void => {
    const fields = { ...output.fields }
    if (next === undefined) delete fields[name]
    else fields[name] = next
    setOutput({ ...output, fields })
  }
  const renameField = (name: string, nextName: string): void => {
    if (nextName === name || output.fields[nextName] !== undefined) return
    const fields: Record<string, FieldSpecJson> = {}
    for (const [key, value] of Object.entries(output.fields)) fields[key === name ? nextName : key] = value
    setOutput({ ...output, fields })
    const mapping = { ...input.mapping }
    if (mapping[name] !== undefined) {
      mapping[nextName] = mapping[name]
      delete mapping[name]
    }
    setInput({ ...input, mapping })
  }
  const setRule = (target: string, rule: MappingRuleJson | undefined): void => {
    const mapping = { ...input.mapping }
    if (rule === undefined) delete mapping[target]
    else mapping[target] = rule
    setInput({ ...input, mapping })
  }
  const addField = (): void => {
    let name = 'field'
    let n = 1
    while (output.fields[name] !== undefined) {
      name = `field${n}`
      n += 1
    }
    setField(name, { type: 'string' })
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setSaveError(undefined)
    try {
      await onSaveOutput(outputRecipe.file, output)
      await onSaveInput(inputRecipe.file, input)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack h='full' p={2} gap={2} overflow='auto'>
      <HStack justify='space-between' wrap='wrap'>
        <HStack gap={3} fontSize='xs' color='fg.muted'>
          <HStack gap={1}>
            <Text>onMissing</Text>
            <NativeSelect.Root size='xs' width='110px'>
              <NativeSelect.Field value={output.onMissing ?? ''} onChange={event => { setOutput({ ...output, onMissing: event.target.value === '' ? undefined : event.target.value }) }}>
                <option value=''>(fail/null)</option>
                {MISSING_POLICIES.filter(policy => policy !== 'default').map(policy => <option key={policy} value={policy}>{policy}</option>)}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </HStack>
          {records.length > 0 && (
            <HStack gap={1}>
              <Text>record</Text>
              <NativeSelect.Root size='xs' width='70px'>
                <NativeSelect.Field value={recordIndex} onChange={event => { setRecordIndex(Number(event.target.value)) }}>
                  {records.map((r, i) => <option key={r.key ?? i} value={i}>#{i + 1}</option>)}
                </NativeSelect.Field>
              </NativeSelect.Root>
            </HStack>
          )}
        </HStack>
        <HStack>
          {saveError !== undefined && <Text color='fg.error' fontSize='xs'>{saveError}</Text>}
          <Button size='xs' onClick={() => { void save() }} disabled={!dirty || saving} loading={saving}>Save</Button>
        </HStack>
      </HStack>

      <Stack gap={2}>
        {Object.entries(output.fields).map(([name, field]) => (
          <FieldTree
            key={name}
            name={name}
            field={field}
            target={name}
            input={input}
            record={record}
            rejected={rejected}
            scopeIds={scopeIds}
            hoveredStepId={hoveredStepId}
            onHoverStepId={setHoveredStepId}
            setRule={setRule}
            onFieldChange={next => { setField(name, next) }}
            onRename={nextName => { renameField(name, nextName) }}
            onRemove={() => { setField(name, undefined) }}
            onExplainMissing={onExplainMissing === undefined ? undefined : () => { onExplainMissing(recordIndex, name) }}
            onExplainRejected={onExplainRejected === undefined
              ? undefined
              : () => {
                  const index = rejected.findIndex(entry => entry.field === name)
                  if (index !== -1) onExplainRejected(index)
                }}
          />
        ))}
      </Stack>

      <Box>
        <Button size='xs' variant='outline' onClick={addField}>+ field</Button>
      </Box>
    </Stack>
  )
}

interface FieldTreeProps {
  name:               string
  field:              FieldSpecJson
  /** This field's dotted mapping-key path (an object member's is `parent.child`; `mapping`'s own keys are dotted the same way — `map-record.use-case.ts` writes them with `setPath`). */
  target:             string
  input:              InputRecipeJson
  record?:            PreviewRecord
  rejected:           RejectedRecord[]
  scopeIds:           string[]
  depth?:             number
  /** The cross-panel highlight's current step id (issue #111), and how a row reports its own hover — threaded through unchanged at every depth, `FieldRow` (not this function) resolves whether it applies to one particular row. */
  hoveredStepId?:     string
  onHoverStepId:      (stepId: string | undefined) => void
  /** Writes the mapping rule at one dotted target, straight into `input.mapping` — the same setter every depth uses, so an object member's rule lands in the flat, top-level `mapping` map exactly like a top-level field's (only an `each` list's own item fields nest inside their list's rule, handled locally below). */
  setRule:            (target: string, rule: MappingRuleJson | undefined) => void
  onFieldChange:      (field: FieldSpecJson) => void
  onRename:           (name: string) => void
  onRemove:           () => void
  onExplainMissing?:  () => void
  onExplainRejected?: () => void
}

/** One field, recursively: an `object` field renders its members (one level: `field-spec.model.ts`'s own doc comment on why deeper nesting is out of scope), an `array` of `object` renders its `each` shape and item fields, anything else is a plain `FieldRow`. */
function FieldTree ({ name, field, target, input, record, rejected, scopeIds, depth = 0, hoveredStepId, onHoverStepId, setRule, onFieldChange, onRename, onRemove, onExplainMissing, onExplainRejected }: FieldTreeProps) {
  if (field.type === 'object' && field.fields !== undefined) {
    return (
      <Stack gap={1}>
        <FieldRow
          name={name} field={field} scopeIds={scopeIds} depth={depth}
          onFieldChange={onFieldChange} onRename={onRename} onRemove={onRemove} onRuleChange={() => {}}
        />
        {Object.entries(field.fields).map(([memberName, memberField]) => (
          <FieldTree
            key={memberName}
            name={memberName}
            field={memberField}
            target={`${target}.${memberName}`}
            input={input}
            record={record}
            rejected={rejected}
            scopeIds={scopeIds}
            depth={depth + 1}
            hoveredStepId={hoveredStepId}
            onHoverStepId={onHoverStepId}
            setRule={setRule}
            onFieldChange={next => { onFieldChange({ ...field, fields: { ...field.fields, [memberName]: next } }) }}
            onRename={nextName => {
              const fields: Record<string, FieldSpecJson> = {}
              const entries = Object.entries(field.fields ?? {})
              for (const [key, value] of entries) fields[key === memberName ? nextName : key] = value
              onFieldChange({ ...field, fields })
            }}
            onRemove={() => {
              const fields = { ...field.fields }
              delete fields[memberName]
              onFieldChange({ ...field, fields })
            }}
          />
        ))}
      </Stack>
    )
  }

  if (field.type === 'array' && field.items?.type === 'object' && field.items.fields !== undefined) {
    const rule = input.mapping[target]
    const eachRule = isEachRule(rule) ? rule : undefined
    const items = field.items
    // Already checked non-empty by this branch's own condition (`field.items.fields !== undefined`); TS does not carry that narrowing across the `items` rebinding above.
    const itemFields = items.fields as Record<string, FieldSpecJson>

    return (
      <Stack gap={1} borderWidth='1px' borderRadius='md' p={2} ml={depth * 5}>
        <HStack gap={2}>
          <Text fontWeight='medium' fontSize='sm'>{name}</Text>
          <Text fontSize='xs' color='fg.muted'>each</Text>
          <Input
            size='xs'
            width='140px'
            placeholder='list id (e.g. items)'
            value={eachRule?.each ?? ''}
            onChange={event => { setRule(target, event.target.value === '' ? undefined : { each: event.target.value, fields: eachRule?.fields ?? {} }) }}
          />
        </HStack>
        {Object.entries(itemFields).map(([itemName, itemField]) => {
          const itemRule = eachRule?.fields[itemName]
          const itemStepId = typeof itemRule?.from === 'string' ? itemRule.from : undefined

          return (
            <FieldRow
              key={itemName}
              name={itemName}
              field={itemField}
              rule={itemRule}
              scopeIds={scopeIds}
              depth={depth + 1}
              stepId={itemStepId}
              highlighted={itemStepId !== undefined && itemStepId === hoveredStepId}
              onHoverStepId={onHoverStepId}
              onFieldChange={next => { onFieldChange({ ...field, items: { ...items, fields: { ...itemFields, [itemName]: next } } }) }}
              onRename={nextName => {
                const fields: Record<string, FieldSpecJson> = {}
                for (const [key, value] of Object.entries(itemFields)) fields[key === itemName ? nextName : key] = value
                onFieldChange({ ...field, items: { ...items, fields } })
              }}
              onRemove={() => {
                const fields = { ...itemFields }
                delete fields[itemName]
                onFieldChange({ ...field, items: { ...items, fields } })
              }}
              onRuleChange={next => {
                const fields = { ...eachRule?.fields }
                if (next === undefined) delete fields[itemName]
                else fields[itemName] = next
                setRule(target, { each: eachRule?.each ?? '', fields })
              }}
            />
          )
        })}
      </Stack>
    )
  }

  const rule = input.mapping[target]
  const fromRule = rule === undefined || isEachRule(rule) ? undefined : rule
  const value = record?.data[name]
  const trace: FieldTraceView | undefined = record?.mapping?.[target]
  const rejectedForField = rejected.filter(entry => entry.field === target)
  const stepId = typeof fromRule?.from === 'string' ? fromRule.from : undefined

  return (
    <FieldRow
      name={name}
      field={field}
      rule={fromRule}
      scopeIds={scopeIds}
      trace={trace}
      missing={value === null}
      // eslint-disable-next-line unicorn/prefer-at -- `.at()` needs an ES2022+ `lib`; `tsconfig.app.json` (the browser build) only has `dom` (see this file's own TS2550 history)
      rejected={rejectedForField.length === 0 ? undefined : { count: rejectedForField.length, reason: rejectedForField[rejectedForField.length - 1].reason }}
      depth={depth}
      stepId={stepId}
      highlighted={stepId !== undefined && stepId === hoveredStepId}
      onHoverStepId={onHoverStepId}
      onFieldChange={onFieldChange}
      onRename={onRename}
      onRemove={onRemove}
      onRuleChange={next => { setRule(target, next) }}
      onExplainMissing={onExplainMissing}
      onExplainRejected={onExplainRejected}
    />
  )
}

export { type FromRuleJson, type FieldSpecJson, type MappingRuleJson } from './field-spec.model'
export { type TransformJson } from './transform-chain.component'
