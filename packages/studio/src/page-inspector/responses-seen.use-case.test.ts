import type { InputRecipe } from '@opencraw/core'
import { responsesSeen } from './responses-seen.use-case'

function webRecipe (url: string): InputRecipe {
  return { kind: 'input', id: 'sample', output: 'thing', mode: 'web', start: [{ url }], steps: [], mapping: {} } as unknown as InputRecipe
}

describe('responsesSeen (web-mode capture needs a real browser — exercised by packages/studio/e2e/inspector.e2e.test.ts)', () => {
  it('answers with an empty list for an api-mode recipe: no page load to observe responses during', async () => {
    const recipe = { ...webRecipe('http://x'), mode: 'api' } as InputRecipe
    await expect(responsesSeen(recipe, 'start')).resolves.toEqual([])
  })

  it('rejects a recipe with no start point', async () => {
    const recipe = { ...webRecipe('http://x'), start: [] }
    await expect(responsesSeen(recipe, 'start')).rejects.toThrow('has no start point')
  })

  it('rejects a step path other than "start"', async () => {
    await expect(responsesSeen(webRecipe('http://x'), 'steps.2')).rejects.toThrow('is not supported yet')
  })
})
