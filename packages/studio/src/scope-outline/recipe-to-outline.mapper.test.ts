import { recipeToOutline } from './recipe-to-outline.mapper'
import type { OutlineBracket, OutlineCard } from './outline.model'

describe('recipeToOutline', () => {
  it('turns each top-level step into a card, with its path and sentence', () => {
    const outline = recipeToOutline({ kind: 'input', steps: [{ type: 'goto', url: '/' }, { type: 'emit' }] })
    expect(outline.steps).toHaveLength(2)
    expect(outline.steps[0]).toMatchObject({ kind: 'card', path: 'steps.0', stepType: 'goto' })
    expect(outline.steps[1]).toMatchObject({ kind: 'card', path: 'steps.1', stepType: 'emit' })
  })

  it('turns forEach/paginate/if into brackets with nested children', () => {
    const outline = recipeToOutline({
      steps: [{ type: 'forEach', as: 'x', over: 'xs', steps: [{ type: 'set', id: 'y', value: 1 }] }],
    })
    const bracket = outline.steps[0] as OutlineBracket
    expect(bracket.kind).toBe('bracket')
    expect(bracket.path).toBe('steps.0')
    expect(bracket.children).toHaveLength(1)
    const [firstChild] = bracket.children
    expect(firstChild.path).toBe('steps.0.steps.0')
  })

  it('gives an if both branches, each with its own path prefix', () => {
    const outline = recipeToOutline({
      steps: [{ type: 'if', test: '{{x}}', steps: [{ type: 'emit' }], else: [{ type: 'set', id: 'y', value: 0 }] }],
    })
    const bracket = outline.steps[0] as OutlineBracket
    const [thenChild] = bracket.children
    const [elseChild] = bracket.elseChildren ?? []
    expect(thenChild.path).toBe('steps.0.steps.0')
    expect(elseChild?.path).toBe('steps.0.else.0')
  })

  it('an if with no else has no elseChildren', () => {
    const outline = recipeToOutline({ steps: [{ type: 'if', test: '{{x}}', steps: [] }] })
    expect((outline.steps[0] as OutlineBracket).elseChildren).toBeUndefined()
  })

  it('never drops a step it cannot understand: a non-object step becomes a custom card', () => {
    const outline = recipeToOutline({ steps: [null, 'not a step', 42] })
    expect(outline.steps).toHaveLength(3)
    for (const node of outline.steps) expect((node as OutlineCard).custom).toBe(true)
  })

  it('never throws on a recipe that is not even an object, or has no steps array', () => {
    expect(recipeToOutline(null).steps).toEqual([])
    expect(recipeToOutline('nope').steps).toEqual([])
    expect(recipeToOutline({ kind: 'output' }).steps).toEqual([])
  })

  it('keeps the whole original recipe (everything but the outline view) under .recipe', () => {
    const content = { kind: 'input', id: 'x', mode: 'web', steps: [{ type: 'emit' }], mapping: {} }
    expect(recipeToOutline(content).recipe).toEqual(content)
  })
})
