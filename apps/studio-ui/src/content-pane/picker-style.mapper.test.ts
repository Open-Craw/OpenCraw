import { pickerStyleCss } from './picker-style.mapper'

describe('pickerStyleCss', () => {
  it('shows a crosshair cursor and a hover outline in pick mode', () => {
    const css = pickerStyleCss(true, false)
    expect(css).toContain('cursor: crosshair')
    expect(css).toContain('[data-oc-node]:hover')
  })

  it('falls back to the inherited cursor outside pick mode', () => {
    expect(pickerStyleCss(false, false)).toContain('cursor: inherit')
  })

  it('highlights a hovered card\'s selector when given one', () => {
    const css = pickerStyleCss(false, false, '.price_color')
    expect(css).toContain('.price_color {')
  })

  it('omits the hover-selector rule when none is given', () => {
    expect(pickerStyleCss(false, false)).not.toContain('rgba(221,107,32')
  })

  it('greys and outlines hidden elements only when the toggle is on', () => {
    expect(pickerStyleCss(false, true)).toContain('[data-oc-hidden]')
    expect(pickerStyleCss(false, false)).not.toContain('[data-oc-hidden]')
  })
})
