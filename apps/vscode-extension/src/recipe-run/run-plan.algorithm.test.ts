import type { RecipeNode } from '../recipe-explorer'
import { planRun, runArguments } from './run-plan.algorithm'

const GROUP = {
  outputId:   'vehicles',
  outputFile: '/w/vehicles.ocw-out.json',
  inputs:     [
    { file: '/w/kia.ocw-in.json', kind: 'input' as const, id: 'kia', output: 'vehicles' },
    { file: '/w/byd.ocw-in.json', kind: 'input' as const, id: 'byd', output: 'vehicles' },
  ],
}

describe('planRun', () => {
  it('on an input recipe runs just that one, with the output it maps onto', () => {
    const node: RecipeNode = { type: 'input', header: GROUP.inputs[0], group: GROUP }

    expect(planRun(node)).toEqual({ ok: true, plan: { paths: ['/w/vehicles.ocw-out.json', '/w/kia.ocw-in.json'], only: ['kia'], outputId: 'vehicles', output: '/w/vehicles.ocw-out.json', label: 'kia' } })
  })

  it('on an output recipe runs every input that feeds it', () => {
    const result = planRun({ type: 'group', group: GROUP })

    expect(result).toMatchObject({ ok: true, plan: { paths: ['/w/vehicles.ocw-out.json', '/w/kia.ocw-in.json', '/w/byd.ocw-in.json'], only: [], label: 'vehicles (2 inputs)' } })
  })

  it('says why there is nothing to run: no output recipe, or no input', () => {
    const orphan = { outputId: 'lost', inputs: [GROUP.inputs[0]] }
    expect(planRun({ type: 'group', group: orphan })).toMatchObject({ ok: false, reason: expect.stringContaining('no output recipe with the id "lost"') })
    expect(planRun({ type: 'input', header: GROUP.inputs[0], group: orphan })).toMatchObject({ ok: false })
    expect(planRun({ type: 'group', group: { ...GROUP, inputs: [] } })).toMatchObject({ ok: false, reason: expect.stringContaining('No input recipe feeds "vehicles"') })
  })
})

describe('runArguments', () => {
  it('writes the records to the given JSON Lines file, one input at a time when asked, with the hooks module when set', () => {
    const planned = planRun({ type: 'input', header: GROUP.inputs[1], group: GROUP })
    if (!planned.ok) throw new Error('expected a plan')

    expect(runArguments(planned.plan, '/tmp/run.jsonl')).toEqual(['run', '/w/vehicles.ocw-out.json', '/w/byd.ocw-in.json', '--out', '/tmp/run.jsonl', '--trace', '--only', 'byd'])
    expect(runArguments(planned.plan, '/tmp/run.jsonl', '/h/hooks.mjs').slice(-2)).toEqual(['--hooks', '/h/hooks.mjs'])
  })
})
