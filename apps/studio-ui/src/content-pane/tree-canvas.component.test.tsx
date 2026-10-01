import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import type { DocumentTreeView } from '@opencraw/studio'
import { TreeCanvas } from './tree-canvas.component'

const TREE: DocumentTreeView = {
  format: 'json',
  root:   {
    id:        'root',
    label:     '$',
    valueType: 'object',
    jsonpath:  '$',
    children:  [{
      id:        'results',
      label:     'results',
      valueType: 'array',
      jsonpath:  '$.results',
      children:  [
        {
          id:        'r0',
          label:     '[0]',
          valueType: 'object',
          jsonpath:  '$.results[0]',
          listPath:  '$.results[*]',
          children:  [
            { id: 'r0.name', label: 'name', valueType: 'string', preview: '"Fiat"', jsonpath: '$.results[0].name', listPath: '$.results[*].name', children: [] },
          ],
        },
        {
          id:        'r1',
          label:     '[1]',
          valueType: 'object',
          jsonpath:  '$.results[1]',
          listPath:  '$.results[*]',
          children:  [
            { id: 'r1.name', label: 'name', valueType: 'string', preview: '"Citroën"', jsonpath: '$.results[1].name', listPath: '$.results[*].name', children: [] },
          ],
        },
      ],
    }],
  },
}

const STEPS = [{ id: 'names', kind: 'jsonpath', selector: '$.results[*].name' }, { id: 'first', kind: 'jsonpath', selector: '$.results[0]' }]

function renderCanvas (hoveredStepId?: string, onHoverStepId: (stepId: string | undefined) => void = () => {}) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <TreeCanvas tree={TREE} onPick={() => {}} steps={STEPS} hoveredStepId={hoveredStepId} onHoverStepId={onHoverStepId} />
    </ChakraProvider>,
  )
}

function nodeWithStep (stepIds: string): HTMLElement[] {
  return screen.getAllByTestId('tree-node').filter(node => node.dataset.stepIds === stepIds)
}

describe('TreeCanvas cross-panel highlighting (issue #124)', () => {
  it('marks every node a step reads with the step\'s id: a list path on each item, an exact path on one', () => {
    renderCanvas()
    expect(nodeWithStep('names')).toHaveLength(2)
    expect(nodeWithStep('first')).toHaveLength(1)
    expect(screen.getAllByText('names')).toHaveLength(2)
  })

  it('lights up the hovered step\'s nodes, and only those', () => {
    renderCanvas('names')
    const lit = screen.getAllByTestId('tree-node').filter(node => node.dataset.highlighted === 'true')
    expect(lit).toHaveLength(2)
    expect(lit.every(node => node.dataset.stepIds === 'names')).toBe(true)
  })

  it('reports the step a hovered node belongs to, and nothing on leaving it or on a node no step reads', () => {
    const onHoverStepId = jest.fn()
    renderCanvas(undefined, onHoverStepId)
    const [citroen] = nodeWithStep('names').slice(1)

    fireEvent.mouseEnter(citroen)
    expect(onHoverStepId).toHaveBeenLastCalledWith('names')
    fireEvent.mouseLeave(citroen)
    expect(onHoverStepId).toHaveBeenLastCalledWith(undefined)
    fireEvent.mouseEnter(screen.getAllByTestId('tree-node')[0])
    expect(onHoverStepId).toHaveBeenLastCalledWith(undefined)
  })
})
