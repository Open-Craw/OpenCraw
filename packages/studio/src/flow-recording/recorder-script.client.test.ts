import { NODE_ID_ATTRIBUTE } from '@opencraw/core'
import { recorderScript } from './recorder-script.client'

describe('recorderScript', () => {
  it('is a self-invoking expression, ready for context.addInitScript', () => {
    const script = recorderScript('__binding__')
    expect(script.trimStart()).toMatch(/^\(\(\) => \{/)
    expect(script.trimEnd()).toMatch(/\}\)\(\)$/)
  })

  it('embeds the binding name it reports through', () => {
    expect(recorderScript('__opencraw_report__')).toContain('window.__opencraw_report__(')
  })

  it('marks reported elements with attribute, defaulting to NODE_ID_ATTRIBUTE (the same one selector-inference reads)', () => {
    expect(recorderScript('b')).toContain(JSON.stringify(NODE_ID_ATTRIBUTE))
    expect(recorderScript('b', 'data-other')).toContain(JSON.stringify('data-other'))
  })

  it('bails out of an iframe (window.top !== window.self) before attaching any listener', () => {
    const script = recorderScript('b')
    expect(script).toContain('window.top !== window.self')
    expect(script.indexOf('window.top !== window.self')).toBeLessThan(script.indexOf("addEventListener('click'"))
  })

  it('detects a target inside a shadow root and reports it as unsupported', () => {
    expect(recorderScript('b')).toContain("reportUnsupportedOnce('shadow-dom')")
    expect(recorderScript('b')).toContain('getRootNode')
  })

  it('reports every action kind the studio plan promises: click, fill, select, keypress, scroll', () => {
    const script = recorderScript('b')
    for (const kind of ['click', 'fill', 'select', 'keypress', 'scroll']) expect(script).toMatch(new RegExp(String.raw`kind:\s*'${kind}'`))
  })

  it('reports a fill only on blur, when the value actually changed — never on every keystroke', () => {
    const script = recorderScript('b')
    expect(script).toContain("addEventListener('focusout'")
    expect(script).not.toContain("addEventListener('input'")
    expect(script).toContain('if (before === target.value) return')
  })

  it('reports a keypress only for Enter', () => {
    expect(recorderScript('b')).toContain("event.key !== 'Enter'")
  })
})
