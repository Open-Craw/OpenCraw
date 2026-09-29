import { fieldToStepIdOf, isEachRule } from './field-spec.model'
import type { MappingRuleJson } from './field-spec.model'

describe('isEachRule', () => {
  it('is true for an each rule, false for a from rule or undefined', () => {
    expect(isEachRule({ each: 'items', fields: {} })).toBe(true)
    expect(isEachRule({ from: 'title' })).toBe(false)
    expect(isEachRule(undefined)).toBe(false)
  })
})

describe('fieldToStepIdOf (issue #111)', () => {
  it('maps a field to its rule\'s plain step id', () => {
    const mapping: Record<string, MappingRuleJson> = { title: { from: 'title' }, price: { from: 'rawPrice' } }
    expect(fieldToStepIdOf(mapping)).toEqual({ title: 'title', price: 'rawPrice' })
  })

  it('skips a field whose rule reads from a list of ids, a template, or is an each rule', () => {
    const mapping: Record<string, MappingRuleJson> = {
      combined: { from: ['a', 'b'] },
      items:    { each: 'rows', fields: {} },
      title:    { from: 'title' },
    }
    expect(fieldToStepIdOf(mapping)).toEqual({ title: 'title' })
  })

  it('is empty for an empty mapping', () => {
    expect(fieldToStepIdOf({})).toEqual({})
  })
})
