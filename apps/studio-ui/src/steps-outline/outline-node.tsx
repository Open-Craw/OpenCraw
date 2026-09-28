import { useState } from 'react'
import { Box, Button, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import type { OutlineNode } from '@opencraw/studio'
import { AddStepMenu } from './add-step-menu'
import type { OutlineActions } from './outline-actions'
import { issuesForNode } from './outline-tree'
import { SentenceView } from './sentence-view'
import { StepForm } from './step-form'

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
  return (
    <Stack gap={1}>
      <AddStepMenu ariaLabel={`${menuLabel} at the start`} onAdd={stepType => { actions.insert(listId, 0, stepType) }} />
      {nodes.map((node, index) => (
        <Stack key={node.path} gap={1}>
          <OutlineNodeView node={node} listId={listId} index={index} lastIndex={nodes.length - 1} allIssues={allIssues} actions={actions} />
          <AddStepMenu ariaLabel={`${menuLabel} after this step`} onAdd={stepType => { actions.insert(listId, index + 1, stepType) }} />
        </Stack>
      ))}
    </Stack>
  )
}

export interface OutlineNodeViewProps {
  node:      OutlineNode
  listId:    string
  index:     number
  lastIndex: number
  /** Every issue on the recipe; each node shows only its own (`outline-tree.ts`'s `issuesForNode`), and passes the whole list on to its children. */
  allIssues: Issue[]
  actions:   OutlineActions
}

/** One card or bracket: its sentence, move/remove controls, its own issues, and (expanded) its form; a bracket also its nested lists. */
export function OutlineNodeView ({ node, listId, index, lastIndex, allIssues, actions }: OutlineNodeViewProps) {
  const [expanded, setExpanded] = useState(false)
  const isBracket = node.kind === 'bracket'
  const isCustom = node.kind === 'card' && node.custom
  const issues = issuesForNode(allIssues, node.path)

  return (
    <Stack gap={1} data-testid={`outline-card-${node.path}`}>
      <HStack
        gap={2}
        p={2}
        borderWidth='1px'
        borderRadius='md'
        bg={isCustom ? 'bg.muted' : 'bg.panel'}
        cursor='pointer'
        onClick={() => { setExpanded(open => !open) }}
      >
        <Stack gap={0} flexShrink={0}>
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
        <Box flex='1'>
          <SentenceView parts={node.sentence} />
          {issues.length > 0 && (
            <Stack gap={0} mt={1}>
              {issues.map(issue => (
                <Text key={issue.message} fontSize='xs' color='fg.error'>{issue.message}</Text>
              ))}
            </Stack>
          )}
        </Box>
        <IconButton aria-label='Remove step' size='2xs' variant='ghost' onClick={event => { event.stopPropagation(); actions.remove(listId, index) }}>
          ✕
        </IconButton>
      </HStack>

      {expanded && !isCustom && (
        <Box pl={8}>
          <StepForm
            stepType={node.stepType}
            step={node.step}
            onChange={step => { actions.edit(node.path, current => ({ ...current, step })) }}
            onCommit={actions.commit}
          />
        </Box>
      )}
      {expanded && isCustom && (
        <Box pl={8}>
          <Text fontSize='xs' color='fg.muted' mb={1}>
            This step doesn&apos;t read as a sentence yet: edit its JSON directly.
          </Text>
          <StepForm stepType={node.stepType} step={node.step} onChange={step => { actions.edit(node.path, current => ({ ...current, step })) }} onCommit={actions.commit} />
        </Box>
      )}

      {isBracket && (
        <Box pl={8} borderLeftWidth='2px' borderColor='border.muted'>
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
