import { isBracket, isBracketStepType } from './outline.model'
import type { OutlineBracket, OutlineCard } from './outline.model'

describe('isBracket', () => {
  it('is true for a bracket node and false for a card', () => {
    const card: OutlineCard = { kind: 'card', path: 'steps.0', stepType: 'goto', sentence: [], step: { type: 'goto', url: '/' }, custom: false }
    const bracket: OutlineBracket = { kind: 'bracket', path: 'steps.1', stepType: 'forEach', sentence: [], step: { type: 'forEach', as: 'x', over: 'y', steps: [] }, children: [] }
    expect(isBracket(card)).toBe(false)
    expect(isBracket(bracket)).toBe(true)
  })
})

describe('isBracketStepType', () => {
  it('recognises forEach, paginate and if, and nothing else', () => {
    expect(isBracketStepType('forEach')).toBe(true)
    expect(isBracketStepType('paginate')).toBe(true)
    expect(isBracketStepType('if')).toBe(true)
    expect(isBracketStepType('goto')).toBe(false)
    expect(isBracketStepType('unknown')).toBe(false)
  })
})
