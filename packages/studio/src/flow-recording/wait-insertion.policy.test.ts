import { insertWaitStep } from './wait-insertion.policy'

describe('insertWaitStep', () => {
  it('inserts a wait after a navigation, for the next selector', () => {
    expect(insertWaitStep({ navigated: true, xhr: false }, '#results')).toEqual({ type: 'wait', selector: '#results' })
  })

  it('inserts a wait after an XHR too, without a navigation', () => {
    expect(insertWaitStep({ navigated: false, xhr: true }, '#results')).toEqual({ type: 'wait', selector: '#results' })
  })

  it('inserts nothing when nothing happened', () => {
    expect(insertWaitStep({ navigated: false, xhr: false }, '#results')).toBeUndefined()
  })

  it('inserts nothing when the next action has no selector (a page-level key press, a scroll)', () => {
    expect(insertWaitStep({ navigated: true, xhr: false }, undefined)).toBeUndefined()
  })
})
