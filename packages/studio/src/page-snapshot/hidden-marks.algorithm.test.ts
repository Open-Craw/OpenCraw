import { HIDDEN_ATTRIBUTE, hiddenMarksScript } from './hidden-marks.algorithm'

describe('hiddenMarksScript', () => {
  it('is a self-invoking expression, ready for page.evaluate', () => {
    const script = hiddenMarksScript()
    expect(script.trimStart()).toMatch(/^\(\(\) => \{/)
    expect(script.trimEnd()).toMatch(/\}\)\(\)$/)
  })

  it('embeds the attribute name to stamp, defaulting to HIDDEN_ATTRIBUTE', () => {
    expect(hiddenMarksScript()).toContain(JSON.stringify(HIDDEN_ATTRIBUTE))
    expect(hiddenMarksScript('data-other')).toContain(JSON.stringify('data-other'))
  })

  it('checks display, visibility and zero size — the three ways a real page hides an element', () => {
    const script = hiddenMarksScript()
    expect(script).toContain("style.display === 'none'")
    expect(script).toContain("style.visibility === 'hidden'")
    expect(script).toContain('rect.width === 0 && rect.height === 0')
  })
})
