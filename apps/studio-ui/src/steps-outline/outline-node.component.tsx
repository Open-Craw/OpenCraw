import { useState } from 'react'
import { Box, Button, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { Reorder, useDragControls } from 'motion/react'
import type { DragControls } from 'motion/react'
import type { OutlineNode } from '@opencraw/studio'
import { useDensity } from '../appearance'
import { useStudioUiStore } from '../studio-store'
import { AddStepMenu } from './add-step-menu.component'
import type { OutlineActions } from './outline-actions'
import { issuesForNode } from './outline-tree'
import { SentenceView } from './sentence-view.component'
import { StepForm } from './step-form.component'

export interface Issue { path: string, message: string }

export interface OutlineListProps {
  listId:    string
  nodes:     OutlineNode[]
  allIssues: Issue[]
  actions:   OutlineActions
  menuLabel: string
}

/**
 * One editable list of steps (the top level, or one bracket's `steps`/`else`):
 * a card/bracket per step, with a `+` menu between and after each. Kept in
 * the same file as `OutlineNodeView` (a bracket's body is itself a list, a
 * list's items are themselves nodes): two files here would import each
 * other, which lint's `import-x/no-cycle` rightly refuses.
 */
export function OutlineList ({ listId, nodes, allIssues, actions, menuLabel }: OutlineListProps) {
  const { listGap } = useDensity()

  return (
    <Stack gap={listGap}>
      <AddStepMenu ariaLabel={`${menuLabel} at the start`} onAdd={stepType => { actions.insert(listId, 0, stepType) }} />
      <Reorder.Group as='div' axis='y' values={nodes} onReorder={order => { actions.reorder(listId, order) }} style={{ display: 'flex', flexDirection: 'column', gap: listGap * 4 }}>
        {nodes.map((node, index) => (
          <OutlineItem key={node.path} node={node} listId={listId} index={index} lastIndex={nodes.length - 1} allIssues={allIssues} actions={actions} menuLabel={menuLabel} />
        ))}
      </Reorder.Group>
    </Stack>
  )
}

interface OutlineItemProps extends Omit<OutlineNodeViewProps, 'dragControls' | 'readOnly'> {
  menuLabel: string
}

/** A step in a list that can be dragged by its grip to a new place: it follows the pointer, the others make way, and the order is saved when it is let go. */
function OutlineItem ({ node, listId, index, lastIndex, allIssues, actions, menuLabel }: OutlineItemProps) {
  const dragControls = useDragControls()
  const { listGap } = useDensity()

  return (
    <Reorder.Item as='div' value={node} dragListener={false} dragControls={dragControls} onDragEnd={actions.commit} whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)', zIndex: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: listGap * 4, position: 'relative' }}>
      <OutlineNodeView node={node} listId={listId} index={index} lastIndex={lastIndex} allIssues={allIssues} actions={actions} dragControls={dragControls} />
      <AddStepMenu ariaLabel={`${menuLabel} after this step`} onAdd={stepType => { actions.insert(listId, index + 1, stepType) }} />
    </Reorder.Item>
  )
}

export interface OutlineNodeViewProps {
  node:          OutlineNode
  listId:        string
  index:         number
  lastIndex:     number
  /** Every issue on the recipe; each node shows only its own (`outline-tree.ts`'s `issuesForNode`), and passes the whole list on to its children. */
  allIssues:     Issue[]
  actions:       OutlineActions
  /**
   * Renders the same card/bracket shape without the move/remove controls or
   * the expand-to-edit form: for a card that is not yet part of the outline
   * a save would write (a `recording-card` streaming in during a recording,
   * issue #95's live cards) — reusing this rendering rather than a parallel
   * one, minus the affordances that only make sense once the card is really
   * in the tree `actions` edits. Default `false`.
   */
  readOnly?:     boolean
  /** Set for a step in a reorderable list: the grip that starts dragging it. */
  dragControls?: DragControls
}

/** One card or bracket: its sentence, move/remove controls, its own issues, and (expanded) its form; a bracket also its nested lists. */
export function OutlineNodeView ({ node, listId, index, lastIndex, allIssues, actions, readOnly = false, dragControls }: OutlineNodeViewProps) {
  const [expanded, setExpanded] = useState(false)
  const { compact, listGap, cardPad, nestIndent } = useDensity()
  const isBracket = node.kind === 'bracket'
  const isCustom = node.kind === 'card' && node.custom
  const issues = issuesForNode(allIssues, node.path)
  const stepId = typeof node.step.id === 'string' ? node.step.id : undefined
  const hoveredStepId = useStudioUiStore(state => state.hoveredStepId)
  const setHoveredStepId = useStudioUiStore(state => state.setHoveredStepId)
  const highlighted = stepId !== undefined && stepId === hoveredStepId

  return (
    <Stack gap={listGap} data-testid={`outline-card-${node.path}`}>
      <HStack
        className='group'
        gap={compact ? 1 : 2}
        p={cardPad}
        borderWidth='1px'
        borderRadius='md'
        data-highlighted={highlighted}
        borderColor={highlighted ? 'orange.solid' : undefined}
        bg={highlighted ? 'orange.subtle' : (isCustom ? 'bg.muted' : 'bg.panel')}
        cursor={readOnly ? 'default' : 'pointer'}
        onClick={readOnly ? undefined : () => { setExpanded(open => !open) }}
        onMouseEnter={readOnly || stepId === undefined ? undefined : () => { setHoveredStepId(stepId) }}
        onMouseLeave={readOnly || stepId === undefined ? undefined : () => { setHoveredStepId(undefined) }}
      >
        {!readOnly && dragControls !== undefined && (
          <Box
            aria-label='Drag to reorder'
            title='Drag to reorder'
            role='img'
            display='flex'
            alignItems='center'
            flexShrink={0}
            px={1}
            color='fg.muted'
            cursor='grab'
            userSelect='none'
            _active={{ cursor: 'grabbing' }}
            style={{ touchAction: 'none' }}
            onClick={(event) => { event.stopPropagation() }}
            onPointerDown={(event) => { event.stopPropagation(); dragControls.start(event) }}
          >
            <svg width='14' height='14' viewBox='0 0 14 14' aria-hidden fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round'>
              <path d='M2 3.5h10M2 7h10M2 10.5h10' />
            </svg>
          </Box>
        )}
        {!readOnly && (
          <Stack direction={compact ? 'row' : 'column'} order={compact ? 2 : 0} gap={0} flexShrink={0} opacity={compact ? 0 : 1} _groupHover={{ opacity: 1 }} _focusWithin={{ opacity: 1 }}>
            <IconButton
              aria-label='Move up'
              size='2xs'
              variant='ghost'
              disabled={index === 0}
              onClick={event => { event.stopPropagation(); actions.move(listId, index, -1) }}
            >
              ↑
            </IconButton>
            <IconButton
              aria-label='Move down'
              size='2xs'
              variant='ghost'
              disabled={index === lastIndex}
              onClick={event => { event.stopPropagation(); actions.move(listId, index, 1) }}
            >
              ↓
            </IconButton>
          </Stack>
        )}
        <Box flex='1' order={1}>
          <SentenceView parts={node.sentence} />
          {issues.length > 0 && (
            <Stack gap={0} mt={1}>
              {issues.map(issue => (
                <Text key={issue.message} fontSize='xs' color='fg.error'>{issue.message}</Text>
              ))}
            </Stack>
          )}
        </Box>
        {!readOnly && (
          <IconButton aria-label='Remove step' size='2xs' variant='ghost' order={3} onClick={event => { event.stopPropagation(); actions.remove(listId, index) }}>
            ✕
          </IconButton>
        )}
      </HStack>

      {expanded && !isCustom && !readOnly && (
        <Box pl={nestIndent}>
          <StepForm
            stepType={node.stepType}
            step={node.step}
            onChange={step => { actions.edit(node.path, current => ({ ...current, step })) }}
            onCommit={actions.commit}
          />
        </Box>
      )}
      {expanded && isCustom && !readOnly && (
        <Box pl={nestIndent}>
          <Text fontSize='xs' color='fg.muted' mb={1}>
            This step doesn&apos;t read as a sentence yet: edit its JSON directly.
          </Text>
          <StepForm stepType={node.stepType} step={node.step} onChange={step => { actions.edit(node.path, current => ({ ...current, step })) }} onCommit={actions.commit} />
        </Box>
      )}

      {isBracket && (
        <Box pl={nestIndent} borderLeftWidth='2px' borderColor='border.muted'>
          <OutlineList listId={`${node.path}::then`} nodes={node.children} allIssues={allIssues} actions={actions} menuLabel='Add step' />
          {node.stepType === 'if' && node.elseChildren !== undefined && (
            <Stack gap={1} mt={2}>
              <Text fontSize='xs' fontWeight='medium' color='fg.muted'>Else</Text>
              <OutlineList listId={`${node.path}::else`} nodes={node.elseChildren} allIssues={allIssues} actions={actions} menuLabel='Add step' />
            </Stack>
          )}
          {node.stepType === 'if' && node.elseChildren === undefined && (
            <Button size='xs' variant='outline' mt={2} onClick={() => { actions.insert(`${node.path}::else`, 0, 'emit') }}>
              + Add an else branch
            </Button>
          )}
        </Box>
      )}
    </Stack>
  )
}
