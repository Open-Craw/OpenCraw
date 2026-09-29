import { ensureBrowserLaunch } from './ensure-browser-launch.use-case'

const missingBrowserError = (): Error => new Error('browserType.launch: Executable doesn\'t exist at /fake/chrome')
const throwMissingBrowser = async (): Promise<never> => { throw missingBrowserError() }
const succeed = async (): Promise<void> => {}
const throwUnrelatedError = async (): Promise<never> => { throw new Error('net::ERR_CONNECTION_REFUSED') }

describe('ensureBrowserLaunch', () => {
  const previousOpencrawChromium = process.env.OPENCRAW_CHROMIUM

  afterEach(() => {
    if (previousOpencrawChromium === undefined) delete process.env.OPENCRAW_CHROMIUM
    else process.env.OPENCRAW_CHROMIUM = previousOpencrawChromium
  })

  it('returns the launch result untouched when it succeeds on the first try', async () => {
    const install = jest.fn()

    const result = await ensureBrowserLaunch(undefined, async () => 'session', install)

    expect(result).toBe('session')
    expect(install).not.toHaveBeenCalled()
  })

  it('rethrows an unrelated launch error without trying to install anything', async () => {
    const install = jest.fn()

    await expect(ensureBrowserLaunch(undefined, throwUnrelatedError, install)).rejects.toThrow('net::ERR_CONNECTION_REFUSED')
    expect(install).not.toHaveBeenCalled()
  })

  it('does not install when an explicit executablePath is configured — a missing browser there is a setup problem', async () => {
    const install = jest.fn()

    await expect(ensureBrowserLaunch({ executablePath: '/opt/chrome' }, throwMissingBrowser, install)).rejects.toThrow(/configured executable path/)
    expect(install).not.toHaveBeenCalled()
  })

  it('does not install when OPENCRAW_CHROMIUM is set — this sandbox already chose a binary', async () => {
    process.env.OPENCRAW_CHROMIUM = '/opt/pw-browsers/chromium'
    const install = jest.fn()

    await expect(ensureBrowserLaunch(undefined, throwMissingBrowser, install)).rejects.toThrow(/configured executable path/)
    expect(install).not.toHaveBeenCalled()
  })

  it('does not install for a non-chromium browserType — the lazy install only ever fetches chromium', async () => {
    const install = jest.fn()

    await expect(ensureBrowserLaunch({ browserType: 'firefox' }, throwMissingBrowser, install)).rejects.toThrow(/playwright install firefox/)
    expect(install).not.toHaveBeenCalled()
  })

  it('installs once and retries, returning the retried launch\'s result', async () => {
    const install = jest.fn(succeed)
    let attempts = 0
    const launchThenSucceed = async (): Promise<string> => {
      attempts++

      return attempts === 1 ? throwMissingBrowser() : 'session-after-install'
    }

    const result = await ensureBrowserLaunch(undefined, launchThenSucceed, install)

    expect(result).toBe('session-after-install')
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('throws a friendly error when the install itself fails', async () => {
    const install = jest.fn(async () => { throw new Error('offline') })

    await expect(ensureBrowserLaunch(undefined, throwMissingBrowser, install)).rejects.toThrow(/could not install Chromium automatically/)
  })

  it('throws a friendly error when the browser is still missing after a successful install', async () => {
    const install = jest.fn(succeed)

    await expect(ensureBrowserLaunch(undefined, throwMissingBrowser, install)).rejects.toThrow(/still not found/)
    expect(install).toHaveBeenCalledTimes(1)
  })
})
