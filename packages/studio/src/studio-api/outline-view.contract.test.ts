import { outlineViewSchema } from './outline-view.contract'

describe('outlineViewSchema', () => {
  it('accepts a view with a card and a bracket, nested', () => {
    const view = {
      recipe: { kind: 'input' },
      steps:  [
        { kind: 'card', path: 'steps.0', stepType: 'goto', sentence: [{ kind: 'word', text: 'Go to' }], step: { type: 'goto', url: '/' }, custom: false },
        {
          kind:     'bracket',
          path:     'steps.1',
          stepType: 'forEach',
          sentence: [],
          step:     { type: 'forEach', as: 'x', over: 'xs', steps: [] },
          children: [{ kind: 'card', path: 'steps.1.steps.0', stepType: 'emit', sentence: [], step: { type: 'emit' }, custom: false }],
        },
      ],
    }
    expect(outlineViewSchema.safeParse(view).success).toBe(true)
  })

  it('accepts an if bracket with an elseChildren list', () => {
    const view = {
      recipe: {},
      steps:  [{
        kind:         'bracket',
        path:         'steps.0',
        stepType:     'if',
        sentence:     [],
        step:         { type: 'if', test: 'x', steps: [], else: [] },
        children:     [],
        elseChildren: [],
      }],
    }
    expect(outlineViewSchema.safeParse(view).success).toBe(true)
  })

  it('rejects a bracket stepType outside forEach/paginate/if', () => {
    const view = { recipe: {}, steps: [{ kind: 'bracket', path: 'steps.0', stepType: 'goto', sentence: [], step: {}, children: [] }] }
    expect(outlineViewSchema.safeParse(view).success).toBe(false)
  })

  it('rejects a sentence part with an unknown kind', () => {
    const view = { recipe: {}, steps: [{ kind: 'card', path: 'steps.0', stepType: 'goto', sentence: [{ kind: 'emoji', text: '👍' }], step: {}, custom: false }] }
    expect(outlineViewSchema.safeParse(view).success).toBe(false)
  })
})
