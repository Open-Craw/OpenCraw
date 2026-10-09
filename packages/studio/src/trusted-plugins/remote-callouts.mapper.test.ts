import { commandAccessPlugin, commandCaptchaSolver, commandHook, httpHook } from '@opencraw/core'
import { remoteCallouts } from './remote-callouts.mapper'

describe('remoteCallouts', () => {
  it('lists what calls outside the process, hooks first, and leaves local code out', () => {
    const remote = remoteCallouts({
      source:         'plugins.mjs',
      hooks:          { zeta: httpHook('zeta', 'https://svc.example/zeta'), local: () => 1, alpha: commandHook('alpha', ['python3', 'alpha.py']) },
      captchaSolvers: [commandCaptchaSolver('reader', ['python3', 'read.py']), { name: 'inline', solve: () => ({ status: 'solved' }) }],
      accessPlugins:  [commandAccessPlugin('leaser', ['python3', 'lease.py'])],
    })

    expect(remote).toEqual([
      { kind: 'hook', name: 'alpha', label: 'command python3 alpha.py' },
      { kind: 'hook', name: 'zeta', label: 'POST https://svc.example/zeta' },
      { kind: 'captcha', name: 'reader', label: 'command python3 read.py' },
      { kind: 'access', name: 'leaser', label: 'command python3 lease.py' },
    ])
  })

  it('is empty for code that all runs in the process', () => {
    expect(remoteCallouts({ source: 'p.mjs', hooks: { a: () => 1 } })).toEqual([])
  })
})
