import { parseInputRecipe } from '../recipe-schema'
import { hookUses } from './hook-use.algorithm'

describe('hookUses', () => {
  it('finds hook steps, the bootstrap\'s included, and hook transforms, inside each rules included (#78)', () => {
    const input = parseInputRecipe({
      kind:    'input',
      id:      'shop',
      output:  'o',
      mode:    'api',
      start:   [{ url: 'https://example.com/' }],
      session: { bootstrap: { steps: [{ type: 'hook', name: 'login' }], keep: ['cookies'] } },
      steps:   [
        { type: 'hook', id: 'token', name: 'sign' },
        { type: 'if', test: 'token', steps: [{ type: 'emit' }], else: [{ type: 'hook', name: 'alert' }] },
      ],
      mapping: {
        price:    { from: 'token', transform: [{ op: 'trim' }, { op: 'hook', name: 'price' }] },
        variants: { each: 'token', fields: { size: { from: '.', transform: [{ op: 'hook', name: 'size' }] } } },
      },
    })
    expect(hookUses(input)).toEqual([
      { recipeId: 'shop', path: 'steps.0', name: 'sign' },
      { recipeId: 'shop', path: 'steps.1.else.0', name: 'alert' },
      { recipeId: 'shop', path: 'session.bootstrap.steps.0', name: 'login' },
      { recipeId: 'shop', path: 'mapping.price.transform.1', name: 'price' },
      { recipeId: 'shop', path: 'mapping.variants.fields.size.transform.0', name: 'size' },
    ])
  })
})
