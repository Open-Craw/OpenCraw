import { NEW_STEP_OPTIONS, newStep, newStepNode } from './new-step.factory'

describe('newStep', () => {
  it('builds a minimal, well-shaped step for every menu option', () => {
    for (const option of NEW_STEP_OPTIONS) {
      const step = newStep(option.stepType)
      expect(step.type).toBe(option.stepType)
    }
  })

  it('gives a container type an empty "steps" array', () => {
    expect(newStep('forEach').steps).toEqual([])
    expect(newStep('if').steps).toEqual([])
    expect(newStep('paginate').steps).toEqual([])
  })
})

describe('newStepNode', () => {
  it('builds a bracket for a container type, at the given path', () => {
    const node = newStepNode('forEach', 'steps.2')
    expect(node.kind).toBe('bracket')
    expect(node.path).toBe('steps.2')
  })

  it('builds a card for a leaf type', () => {
    const node = newStepNode('goto', 'steps.0')
    expect(node.kind).toBe('card')
  })
})
