import { findPickNode } from './ui-pick-target.algorithm'

const PAGE = '<html><body data-oc-node="n0"><h1 data-oc-node="n1">Renault Clio</h1><div data-oc-node="n2" class="price"><span data-oc-node="n3">From</span> <b data-oc-node="n4">€ 19 900</b></div><p data-oc-node="n5">Clio   hatch\n back</p></body></html>'

describe('findPickNode', () => {
  it('finds an element by its CSS selector', () => {
    expect(findPickNode(PAGE, { selector: '.price b' })).toEqual({ nodeId: 'n4', text: '€ 19 900' })
  })

  it('finds the smallest element that shows exactly the text, ignoring case and spacing', () => {
    expect(findPickNode(PAGE, { text: '€ 19 900' })).toEqual({ nodeId: 'n4', text: '€ 19 900' })
    expect(findPickNode(PAGE, { text: 'clio hatch back' })).toEqual({ nodeId: 'n5', text: 'Clio hatch back' })
  })

  it('falls back to the smallest element that contains the text', () => {
    expect(findPickNode(PAGE, { text: 'Clio' })).toEqual({ nodeId: 'n1', text: 'Renault Clio' })
  })

  it('prefers the selector when both are given', () => {
    expect(findPickNode(PAGE, { selector: 'h1', text: '€ 19 900' })).toEqual({ nodeId: 'n1', text: 'Renault Clio' })
  })

  it('says why nothing was found', () => {
    expect(findPickNode(PAGE, { selector: '.nope' })).toEqual({ reason: 'nothing on the page matches .nope' })
    expect(findPickNode(PAGE, { selector: 'div[' })).toEqual({ reason: 'div[ is not a valid CSS selector' })
    expect(findPickNode(PAGE, { text: 'Megane' })).toEqual({ reason: 'no element on the page shows "Megane"' })
    expect(findPickNode(PAGE, {})).toEqual({ reason: 'say what to pick: a CSS selector or the text it shows' })
  })
})
