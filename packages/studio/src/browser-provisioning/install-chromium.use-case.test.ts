const failingInstall = async (): Promise<void> => { throw new Error('network down') }
const succeedingInstall = async (): Promise<void> => {}

describe('installChromiumOnce', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('dedupes concurrent calls into a single run', async () => {
    const { installChromiumOnce } = await import('./install-chromium.use-case')
    let calls = 0
    const run = async (): Promise<void> => { calls++ }

    await Promise.all([installChromiumOnce(run), installChromiumOnce(run)])

    expect(calls).toBe(1)
  })

  it('memoizes a successful install: a later call does not run again', async () => {
    const { installChromiumOnce } = await import('./install-chromium.use-case')
    let calls = 0
    const run = async (): Promise<void> => { calls++ }

    await installChromiumOnce(run)
    await installChromiumOnce(run)

    expect(calls).toBe(1)
  })

  it('clears the memo on failure, so the next call retries', async () => {
    const { installChromiumOnce } = await import('./install-chromium.use-case')

    await expect(installChromiumOnce(failingInstall)).rejects.toThrow('network down')
    await expect(installChromiumOnce(succeedingInstall)).resolves.toBeUndefined()
  })
})
