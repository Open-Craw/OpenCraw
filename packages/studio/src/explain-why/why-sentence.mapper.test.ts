import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FieldTrace } from '@opencraw/core'
import { buildWhySentence } from './why-sentence.mapper'
import type { WhyFacts } from './why-sentence.mapper'

/**
 * The guide's own captured runs (`docs/how-it-works/captures/*.json`,
 * `docs/how-it-works/capture/capture.mjs`): real `record:emit.mapping`
 * traces and scope snapshots from real recipes, the corpus issue #92 asks
 * for. They hold a record's `data`/`scope`/`mapping` (and, for a rejected
 * record, `rejected: { field, reason }` and `scope`) but not raw
 * `step:*` events — `capture.mjs` never kept those — so the `step` half of
 * a `WhyFacts` below (which step bound the id, whether it ran or was
 * skipped) is supplied by hand, reading the scene's own recipe to name a
 * step that is really there, not invented.
 */
const CAPTURES = join(__dirname, '../../../../docs/how-it-works/captures')

function capture (name: string): { records: Array<{ data?: Record<string, unknown>, mapping?: Record<string, FieldTrace>, scope?: Record<string, unknown>, rejected?: { field: string, reason: string } }> } {
  return JSON.parse(readFileSync(join(CAPTURES, `${name}.json`), 'utf8')) as ReturnType<typeof capture>
}

describe('buildWhySentence', () => {
  it('names the field, the step and the policy for a value left null by the missing-value policy (policy-precedence capture)', () => {
    // boston-overtime.input.json's `otLossesField` rule has no `from` that resolves (the scope has no such
    // id at all — `policy-precedence` is deliberately about which policy wins, not about a real source), so
    // its trace is `{ from: "", steps: [] }` and the field ends up `null`: docs/how-it-works/recipes/policy-precedence.
    const record = capture('policy-precedence').records.find(entry => entry.data?.otLossesField === null)
    if (record === undefined) throw new Error('fixture drifted: expected a record with otLossesField null')
    const trace = record.mapping?.otLossesField
    const facts: WhyFacts = {
      field:   'otLossesField',
      outcome: 'missing',
      policy:  'null',
      trace,
      boundId: 'otLosses',
      step:    { path: 'steps.1', stepType: 'extract', stepId: 'otLosses', outcome: 'ran' },
    }

    const sentence = buildWhySentence(facts)

    expect(sentence).toBe('"otLossesField" is missing: the Read step "otLosses" (steps.1) ran and bound "otLosses", but "otLossesField" reads "" from it, which was empty; left null by policy.')
  })

  it('names the loop and says it was skipped, for a field whose forEach item never ran (policy-each-gap capture)', () => {
    // pastAbilities[0].name is rejected (skip-record), not left null: the fixture below is built to match this
    // capture's shape (the ability entry itself is null in the scope, docs/how-it-works/recipes/policy-each-gap)
    // but exercises the "skipped" branch, which this scene's capture has no example of on its own.
    const record = capture('policy-each-gap').records.find(entry => entry.rejected !== undefined)
    if (record === undefined) throw new Error('fixture drifted: expected a rejected record')
    const facts: WhyFacts = {
      field:   record.rejected!.field,
      outcome: 'missing',
      policy:  'null',
      boundId: 'ability',
      step:    { path: 'steps.2.steps.0', stepType: 'extract', stepId: 'ability', outcome: 'skipped', error: 'not found' },
      hint:    'the item has: is_hidden, slot, ability',
    }

    const sentence = buildWhySentence(facts)

    expect(sentence).toContain('"pastAbilities[0].name" is missing')
    expect(sentence).toContain('the Read step "ability" (steps.2.steps.0), which binds "ability", was skipped (not found)')
    expect(sentence).toContain('left null by policy')
    expect(sentence).toContain('the item has: is_hidden, slot, ability')
  })

  it('explains a rejected record with the engine\'s own coercion reason and the skip-record policy (policy-transform capture)', () => {
    const record = capture('policy-transform').records.find(entry => entry.rejected?.reason.includes('transform "integer"'))
    if (record === undefined) throw new Error('fixture drifted: expected an "integer" coercion rejection')
    const facts: WhyFacts = { field: record.rejected!.field, outcome: 'rejected', reason: record.rejected!.reason, policy: 'skip-record' }

    const sentence = buildWhySentence(facts)

    expect(sentence).toBe(`"otLosses" was rejected: ${record.rejected!.reason} (policy: skip-record).`)
  })

  it('says plainly when no step in the recipe binds the source at all', () => {
    const sentence = buildWhySentence({ field: 'title', outcome: 'missing', boundId: 'subtitle', step: { path: '', stepType: '', outcome: 'not-found' } })

    expect(sentence).toBe('"title" is missing: no step in this recipe binds "subtitle".')
  })

  it('says plainly when the rule could not even be found (no boundId, no step)', () => {
    const sentence = buildWhySentence({ field: 'generatedOnly', outcome: 'missing' })

    expect(sentence).toBe('"generatedOnly" is missing: no step in this recipe binds its source.')
  })

  it('gives a reason of last resort when the engine gave none', () => {
    const sentence = buildWhySentence({ field: 'x', outcome: 'rejected' })

    expect(sentence).toBe('"x" was rejected: the engine gave no reason.')
  })
})
