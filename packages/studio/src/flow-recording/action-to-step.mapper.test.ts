import { actionToStep } from './action-to-step.mapper'

describe('actionToStep', () => {
  it('a click becomes a click step', () => {
    expect(actionToStep({ kind: 'click', selector: 'a.next' })).toEqual({ type: 'click', selector: 'a.next' })
  })

  it('a click with no verified selector maps to nothing', () => {
    expect(actionToStep({ kind: 'click' })).toBeUndefined()
  })

  it('a fill becomes a fill step, value included exactly as given (already a placeholder for a secret)', () => {
    expect(actionToStep({ kind: 'fill', selector: '#pass', value: '{{env.PASSWORD}}' })).toEqual({ type: 'fill', selector: '#pass', value: '{{env.PASSWORD}}' })
  })

  it('a select becomes a select step', () => {
    expect(actionToStep({ kind: 'select', selector: '#country', value: 'IT' })).toEqual({ type: 'select', selector: '#country', value: 'IT' })
  })

  it('a page-level keypress becomes a press step with no selector', () => {
    expect(actionToStep({ kind: 'keypress', key: 'Enter' })).toEqual({ type: 'press', key: 'Enter' })
  })

  it('a keypress on a focused element becomes a press step with its selector', () => {
    expect(actionToStep({ kind: 'keypress', selector: '#search', key: 'Enter' })).toEqual({ type: 'press', selector: '#search', key: 'Enter' })
  })

  it('a scroll becomes "Scroll to bottom"', () => {
    expect(actionToStep({ kind: 'scroll' })).toEqual({ type: 'scroll', to: 'bottom' })
  })
})
