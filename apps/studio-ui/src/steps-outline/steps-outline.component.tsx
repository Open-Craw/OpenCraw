import { useEffect, useState } from 'react'
import { Badge, Box, Button, HStack, Stack, Text } from '@chakra-ui/react'
import type { OutlineNode, OutlineView, RecipeListing } from '@opencraw/studio'
import { useRecordingStore } from '../studio-store'
import type { RecordingNote } from '../studio-store'
import { carriesCard, droppedCard } from './card-drop.model'
import { useHookNames } from '../hook-names'
import { newStepNode } from './new-step.factory'
import type { OutlineActions } from './outline-actions'
import { OutlineList, OutlineNodeView } from './outline-node.component'
import { listAt, listPathPrefix, withList, withNode } from './outline-tree'

export interface StepsOutlineProps {
  recipe?:       RecipeListing
  onSaveOutline: (path: string, outline: OutlineView) => Promise<void>
}

/** None of the live recording cards' move/remove/edit affordances are shown (`outline-node.component.tsx`'s `readOnly`), so these are never actually invoked — a plain, inert stand-in rather than threading the real `actions` (whose `listId`s belong to the real, saved outline) into a section that is not that outline yet. */
const READ_ONLY_ACTIONS: OutlineActions = {
  edit:   () => {},
  commit: () => {},
  move:   () => {},
  remove: () => {},
  insert: () => {},
}

/**
 * The Steps tab: the selected recipe's `outline` (from `open-workspace`,
 * built server-side by `@opencraw/studio`'s `scope-outline` slice) as
 * cards and brackets. Local edits update this component's own state right
 * away (so typing and reordering feel instant); a structural change
 * (add/move/remove) and a "committed" field edit (a blur, a toggle) both go
 * through `save-outline`, after which the parent's usual reload
 * (`open-workspace` again) hands back the authoritative outline — the same
 * round trip `json-editor` already relies on for the JSON tab, so editing
 * either tab keeps the other one honest.
 *
 * While a recording is running for this recipe (issue #95, phase 6), every
 * `recording-card` streamed into `studio-store`'s `recording.store.ts` is
 * appended below the real outline, read-only, through the very same
 * `OutlineNodeView` every other card renders with — never a second card
 * renderer — since these steps are not part of the outline `save-outline`
 * would write until the recording stops and "make this the login"/"keep as
 * steps" (the content pane's own bar) actually saves them. A `next-link`
 * note offers to convert its click into a `paginate` bracket right here,
 * written through the same `save` (and so the same `save-outline`) any other
 * edit uses.
 */
export function StepsOutline ({ recipe, onSaveOutline }: StepsOutlineProps) {
  const [outline, setOutline] = useState<OutlineView | undefined>(recipe?.outline)
  useEffect(() => { setOutline(recipe?.outline) }, [recipe?.file, recipe?.text])
  const [convertedNotes, setConvertedNotes] = useState<ReadonlySet<number>>(new Set())
  /** A card (a canvas's staged selection, issue #121) is being dragged over the tab. */
  const [cardOver, setCardOver] = useState(false)

  const hookNames = useHookNames()
  const recordingRecipeId = useRecordingStore(state => state.recipeId)
  const recordingActive = useRecordingStore(state => state.active)
  const recordingStopped = useRecordingStore(state => state.stoppedSteps !== undefined)
  const recordingCards = useRecordingStore(state => state.cards)
  const recordingNotes = useRecordingStore(state => state.notes)

  if (recipe === undefined) {
    return <Box p={4} color='fg.muted'><Text>Select a recipe to see its steps.</Text></Box>
  }
  if (outline === undefined) {
    return <Box p={4} color='fg.muted'><Text>This recipe has no steps to show (not an input recipe, or its JSON is not an object).</Text></Box>
  }

  const save = (next: OutlineView): void => {
    setOutline(next)
    void onSaveOutline(recipe.file, next)
  }

  const actions: OutlineActions = {
    edit: (path, updater) => {
      setOutline(current => (current === undefined ? current : withNode(current, path, updater)))
    },
    commit: () => {
      setOutline(current => {
        if (current !== undefined) void onSaveOutline(recipe.file, current)

        return current
      })
    },
    move: (listId, index, direction) => {
      if (outline === undefined) return
      const list = listAt(outline, listId)
      const target = index + direction
      if (target < 0 || target >= list.length) return
      const reordered = [...list]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(target, 0, moved)
      save(withList(outline, listId, reordered))
    },
    remove: (listId, index) => {
      if (outline === undefined) return
      const list = listAt(outline, listId)
      save(withList(outline, listId, list.filter((_, position) => position !== index)))
    },
    insert: (listId, index, stepType) => {
      if (outline === undefined) return
      const list = listAt(outline, listId)
      const path = `${listPathPrefix(listId)}.${index}`
      const node = newStepNode(stepType, path, hookNames?.[0])
      save(withList(outline, listId, [...list.slice(0, index), node, ...list.slice(index)]))
    },
  }

  /**
   * "Turn into pagination" (issue #95's next-link offer): appends a
   * `paginate` bracket, `next.selector` from the note's own click card, to
   * the recipe's real, saved outline — the same shape `next-link.policy.ts`'s
   * `paginateStepFor` computes server-side, built here since the client only
   * has the note's already-resolved selector, not that server-only function
   * (`apps/studio-ui` never imports `@opencraw/studio`'s runtime — see
   * `new-step.factory.ts`'s own doc comment for why). The body starts empty,
   * same as any other bracket a `+` menu or a pick starts: the person fills
   * in what runs on each page.
   */
  function convertNextLink (note: RecordingNote, index: number): void {
    if (outline === undefined || note.selector === undefined) return
    const path = `steps.${outline.steps.length}`
    const bracket: OutlineNode = {
      kind:     'bracket',
      path,
      stepType: 'paginate',
      sentence: [{ kind: 'word', text: 'For every page — click' }, { kind: 'code', text: note.selector }],
      step:     { type: 'paginate', next: { selector: note.selector }, steps: [] },
      children: [],
    }
    save({ ...outline, steps: [...outline.steps, bracket] })
    setConvertedNotes(current => new Set(current).add(index))
  }

  const showRecording = recordingRecipeId === recipe.id && (recordingActive || recordingStopped)

  /**
   * A card dropped on the tab (issue #121: a canvas's staged selection,
   * dragged here instead of clicking its "Add to recipe") is appended to the
   * recipe's top-level steps, exactly as that button appends it through the
   * content pane — re-pathed to its new slot, saved through the same `save`.
   */
  function dropCard (event: React.DragEvent<HTMLDivElement>): void {
    if (!carriesCard(event.dataTransfer)) return
    event.preventDefault()
    setCardOver(false)
    const node = droppedCard(event.dataTransfer)
    if (node === undefined || outline === undefined) return
    save({ ...outline, steps: [...outline.steps, { ...node, path: `steps.${String(outline.steps.length)}` }] })
  }

  function dragCardOver (event: React.DragEvent<HTMLDivElement>): void {
    if (!carriesCard(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setCardOver(true)
  }

  return (
    <Box
      h='full'
      overflow='auto'
      p={2}
      data-testid='steps-outline'
      data-card-over={cardOver}
      outline={cardOver ? '2px dashed' : undefined}
      outlineColor='blue.solid'
      outlineOffset='-4px'
      onDragOver={dragCardOver}
      onDragLeave={() => { setCardOver(false) }}
      onDrop={dropCard}
    >
      {/*
        Keyed on the recipe's own file: forces a fresh subtree (and so a
        fresh `StepForm`/TanStack Form instance per card) whenever the
        selected recipe changes, even when a step at the same tree position
        keeps the same `path` across recipes. Without this, `step-form.tsx`'s
        TanStack Form (whose values are seeded once, from `defaultValues`)
        would keep showing the previous recipe's field values for a card
        that never itself remounted.
      */}
      <OutlineList key={recipe.file} listId='' nodes={outline.steps} allIssues={recipe.issues} actions={actions} menuLabel='Add step' />

      {showRecording && (
        <Box mt={3} pt={2} borderTopWidth='1px' borderColor='border.muted' data-testid='recording-cards'>
          <HStack gap={2} mb={1}>
            <Text fontSize='xs' fontWeight='semibold' color='fg.muted'>{recordingActive ? 'Recording…' : 'Recording stopped'}</Text>
            <Badge size='sm' colorPalette={recordingActive ? 'red' : 'gray'}>
              {recordingCards.length} step{recordingCards.length === 1 ? '' : 's'}
            </Badge>
          </HStack>
          <Stack gap={1}>
            {recordingCards.map((card, index) => (
              <OutlineNodeView
                key={`recording:${index}:${card.node.path}`}
                node={card.node}
                listId='recording'
                index={index}
                lastIndex={recordingCards.length - 1}
                allIssues={[]}
                actions={READ_ONLY_ACTIONS}
                readOnly
              />
            ))}
          </Stack>
          {recordingNotes.length > 0 && (
            <Stack gap={1} mt={2}>
              {recordingNotes.map((note, index) => (
                <HStack
                  key={`note:${index}:${note.message}`}
                  gap={2}
                  p={2}
                  borderWidth='1px'
                  borderRadius='md'
                  borderColor={note.kind === 'unsupported' ? 'orange.muted' : 'border.muted'}
                  bg='bg.muted'
                >
                  <Text fontSize='xs' flex='1'>{note.message}</Text>
                  {note.kind === 'next-link' && note.selector !== undefined && !convertedNotes.has(index) && (
                    <Button size='2xs' colorPalette='blue' onClick={() => { convertNextLink(note, index) }}>
                      Turn into pagination
                    </Button>
                  )}
                  {note.kind === 'next-link' && convertedNotes.has(index) && <Badge size='sm' colorPalette='green'>Added</Badge>}
                </HStack>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  )
}
