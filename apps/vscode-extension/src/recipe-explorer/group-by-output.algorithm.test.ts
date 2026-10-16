import { groupByOutput } from './group-by-output.algorithm'
import type { readRecipeHeader } from './read-recipe-header.algorithm'

const out = (id: string): ReturnType<typeof readRecipeHeader> => ({ file: `/w/${id}.ocw-out.json`, kind: 'output', id })
const inp = (id: string, output?: string): ReturnType<typeof readRecipeHeader> => ({ file: `/w/${id}.ocw-in.json`, kind: 'input', id, ...(output !== undefined && { output }) })

describe('groupByOutput', () => {
  it('puts each input under the output it names, groups and inputs in order', () => {
    const groups = groupByOutput([inp('renault', 'offers'), out('vehicles'), inp('kia', 'vehicles'), out('offers'), inp('byd', 'vehicles')].map(header => header as NonNullable<typeof header>))

    expect(groups.map(group => [group.outputId, group.outputFile, group.inputs.map(input => input.id)])).toEqual([
      ['offers', '/w/offers.ocw-out.json', ['renault']],
      ['vehicles', '/w/vehicles.ocw-out.json', ['byd', 'kia']],
    ])
  })

  it('shows an output nothing feeds yet, and an input whose output is not in the workspace', () => {
    const groups = groupByOutput([out('empty'), inp('lost', 'elsewhere')].map(header => header as NonNullable<typeof header>))

    expect(groups).toEqual([
      { outputId: 'elsewhere', inputs: [{ file: '/w/lost.ocw-in.json', kind: 'input', id: 'lost', output: 'elsewhere' }] },
      { outputId: 'empty', outputFile: '/w/empty.ocw-out.json', inputs: [] },
    ])
  })

  it('leaves out an input that names no output', () => {
    expect(groupByOutput([inp('free')].map(header => header as NonNullable<typeof header>))).toEqual([])
  })
})
