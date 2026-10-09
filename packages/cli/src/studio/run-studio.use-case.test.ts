import { runStudio } from './run-studio.use-case'
import type { Terminal } from '../terminal'

function terminal (): { terminal: Terminal, out: string[], err: string[] } {
  const out: string[] = []
  const err: string[] = []

  return {
    terminal: { out: line => { out.push(line) }, err: line => { err.push(line) } },
    out,
    err,
  }
}

describe('runStudio', () => {
  it('prints an install hint and returns 1 when @opencraw/studio is not installed', async () => {
    const { terminal: term, err } = terminal()
    const notFound = Object.assign(new Error("Cannot find package '@opencraw/studio'"), { code: 'ERR_MODULE_NOT_FOUND' })

    const code = await runStudio(undefined, term, () => Promise.reject(notFound))

    expect(code).toBe(1)
    expect(err.some(line => line.includes('npm install @opencraw/studio'))).toBe(true)
  })

  it('rethrows an import failure that is not "module not found"', async () => {
    const { terminal: term } = terminal()
    const other = new Error('boom')

    await expect(runStudio('recipes', term, () => Promise.reject(other))).rejects.toThrow('boom')
  })

  it('delegates to the module\'s main with the folder as argv', async () => {
    const { terminal: term } = terminal()
    const calls: (readonly string[])[] = []
    const code = await runStudio('recipes', term, () => Promise.resolve({ main: async (argv: readonly string[]) => { calls.push(argv) } }))

    expect(code).toBe(0)
    expect(calls).toEqual([['recipes']])
  })

  it('loads the --hooks module itself and hands it to the studio with its file name (issue #150)', async () => {
    const { terminal: term } = terminal()
    const hooks = { double: (input: unknown) => Number(input) * 2 }
    const received: unknown[] = []
    await runStudio('recipes', term, () => Promise.resolve({ main: async (_argv, options) => { received.push(options?.plugins) } }), 'hooks.mjs', () => Promise.resolve({ hooks, accessPlugins: [], captchaSolvers: [] }))

    expect(received).toEqual([{ source: 'hooks.mjs', hooks, accessPlugins: [], captchaSolvers: [] }])
  })

  it('fails before starting the studio when the hooks module cannot be loaded', async () => {
    const { terminal: term } = terminal()
    let started = false

    await expect(runStudio('recipes', term, () => Promise.resolve({ main: async () => { started = true } }), 'missing.mjs', () => Promise.reject(new Error('missing.mjs: cannot load hooks')))).rejects.toThrow('cannot load hooks')
    expect(started).toBe(false)
  })

  it('passes no plugins when --hooks is not given', async () => {
    const { terminal: term } = terminal()
    const received: unknown[] = []
    await runStudio('recipes', term, () => Promise.resolve({ main: async (_argv, options) => { received.push(options?.plugins) } }))

    expect(received).toEqual([undefined])
  })

  it('passes no argv when no folder is given', async () => {
    const { terminal: term } = terminal()
    const calls: (readonly string[])[] = []
    await runStudio(undefined, term, () => Promise.resolve({ main: async (argv: readonly string[]) => { calls.push(argv) } }))

    expect(calls).toEqual([[]])
  })
})
