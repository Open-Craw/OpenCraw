import type { InputRecipe } from '../recipe-schema'
import { recipeRuns, variantLabel } from './recipe-matrix.algorithm'

const base: InputRecipe = { kind: 'input', id: 'report', output: 'row', mode: 'api', start: [{ url: 'http://x/' }], vars: { state: 'Delhi', month: 'Jan' }, steps: [{ type: 'emit' }], mapping: {} }

describe('recipeRuns', () => {
  it('runs a recipe without a matrix once, as it is', () => {
    expect(recipeRuns(base)).toEqual([{ input: base }])
  })

  it('runs every combination of a matrix of lists, the first var varying slowest, over the recipe vars', () => {
    const runs = recipeRuns({ ...base, matrix: { state: ['DL', 'KA'], group: ['Bus', 'Goods'] } })
    expect(runs.map(run => run.variant)).toEqual([
      { state: 'DL', group: 'Bus' }, { state: 'DL', group: 'Goods' }, { state: 'KA', group: 'Bus' }, { state: 'KA', group: 'Goods' },
    ])
    expect(runs[3].input.vars).toEqual({ state: 'KA', month: 'Jan', group: 'Goods' })
  })

  it('runs the var sets of a list, in order', () => {
    const runs = recipeRuns({ ...base, matrix: [{ state: 'DL', group: 'Bus' }, { state: 'KA' }] })
    expect(runs.map(run => run.input.vars)).toEqual([{ state: 'DL', month: 'Jan', group: 'Bus' }, { state: 'KA', month: 'Jan' }])
  })

  it('labels a variant', () => {
    expect(variantLabel({ state: 'DL', year: 2026 })).toBe('state=DL, year=2026')
  })
})
