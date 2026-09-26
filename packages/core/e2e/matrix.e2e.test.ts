import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink, traceLine } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'maker', version: 1, fields: { maker: { type: 'string', key: true, required: true }, tag: { type: 'string', key: true, required: true }, search: { type: 'string' } } }

function searchRecipe (matrix: unknown): Record<string, unknown> {
  return {
    kind:   'input',
    id:     'makers',
    output: 'maker',
    mode:   'api',
    vars:   { q: 'TVS', tag: 'none' },
    matrix,
    start:  [{ url: `${FIXTURE_BASE}/widgets/makers` }],
    steps:  [
      { type: 'set', id: 'search', value: '{{ vars.q }}' },
      { type: 'set', id: 'tag', value: '{{ vars.tag }}' },
      { type: 'request', id: 'found', url: '{{ start.url }}?search={{ vars.q }}', as: 'json' },
      { type: 'forEach', over: 'found', as: 'name', emit: true, steps: [] },
    ],
    mapping: { maker: { from: 'name' }, tag: { from: 'tag' }, search: { from: 'search' } },
  }
}

describe('matrix (one recipe, run once per set of vars)', () => {
  it('runs every combination of the listed values, first var slowest, and reports each run with its variant', async () => {
    const sink = memorySink()
    const trace: string[] = []
    const crawler = createCrawler({
      sink,
      onEvent: (event) => {
        const line = traceLine(event)
        if (line?.startsWith('▶') === true) trace.push(line)
      },
    })
    try {
      const report = await crawler.run(await loadRecipes([output, searchRecipe({ q: ['TATA', 'AUTO'], tag: ['a', 'b'] })]))
      expect(report.recipes.map(recipe => [recipe.variant, recipe.emitted, recipe.error])).toEqual([
        [{ q: 'TATA', tag: 'a' }, 2, undefined],
        [{ q: 'TATA', tag: 'b' }, 2, undefined],
        [{ q: 'AUTO', tag: 'a' }, 1, undefined],
        [{ q: 'AUTO', tag: 'b' }, 1, undefined],
      ])
      expect(report.records).toBe(6)
      expect(sink.records.map(({ data }) => `${data.search}/${data.tag}: ${data.maker}`)).toEqual([
        'TATA/a: TATA MOTORS LTD', 'TATA/a: TATA MOTORS PASSENGER VEHICLES LTD',
        'TATA/b: TATA MOTORS LTD', 'TATA/b: TATA MOTORS PASSENGER VEHICLES LTD',
        'AUTO/a: BAJAJ AUTO', 'AUTO/b: BAJAJ AUTO',
      ])
      expect(trace[0]).toBe('▶ makers [q=TATA, tag=a] (api)')
    } finally {
      await crawler.close()
    }
  })

  it('runs a list of sets as given, each over the recipe vars; without a matrix, once with the vars', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const listed = await crawler.run(await loadRecipes([output, searchRecipe([{ q: 'EICHER' }, { q: 'LEYLAND', tag: 'bus' }])]))
      expect(listed.recipes.map(recipe => recipe.variant)).toEqual([{ q: 'EICHER' }, { q: 'LEYLAND', tag: 'bus' }])
      expect(sink.records.map(({ data }) => `${data.tag}: ${data.maker}`)).toEqual(['none: EICHER MOTORS', 'bus: ASHOK LEYLAND'])

      const plain = await crawler.run(await loadRecipes([output, searchRecipe(undefined)]))
      expect(plain.recipes).toHaveLength(1)
      expect(plain.recipes[0].variant).toBeUndefined()
      expect(plain.recipes[0].emitted).toBe(1)
    } finally {
      await crawler.close()
    }
  })

  it('refuses a matrix var the recipe does not declare', async () => {
    await expect(loadRecipes([output, searchRecipe({ year: [2025, 2026] })])).rejects.toThrow(/matrix\.year: "year" is not a var of this recipe/)
  })
})
