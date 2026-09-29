import type { BrowserSessionConfig } from '@opencraw/core'
import { installChromiumOnce } from './install-chromium.use-case'
import { isMissingBrowserError } from './missing-browser.policy'

/**
 * Runs a browser-launching function, and — only when it fails with Playwright's own "no browser
 * downloaded" error, only for a default chromium launch with no explicit binary configured — installs
 * Chromium once and retries, instead of letting Playwright's raw error reach the studio's caller.
 *
 * An explicit `executablePath` or `OPENCRAW_CHROMIUM` means the person (or this repo's own sandbox)
 * already chose a specific binary; a missing-browser failure there is their setup to fix, not
 * something to silently install over.
 */
export async function ensureBrowserLaunch<T> (
  browser: BrowserSessionConfig | undefined,
  launch: () => Promise<T>,
  installChromium: (run?: () => Promise<void>) => Promise<void> = installChromiumOnce,
): Promise<T> {
  try {
    return await launch()
  } catch (error) {
    if (!isMissingBrowserError(error)) throw error

    if (browser?.executablePath !== undefined || process.env.OPENCRAW_CHROMIUM !== undefined) {
      throw new Error('@opencraw/studio: no browser found at the configured executable path. Check it, or unset it and let the studio install Chromium itself.', { cause: error })
    }
    if ((browser?.browserType ?? 'chromium') !== 'chromium') {
      throw new Error(`@opencraw/studio: no ${browser?.browserType} browser found. Run "npx playwright install ${browser?.browserType}" and try again.`, { cause: error })
    }

    try {
      await installChromium()
    } catch (installError) {
      throw new Error('@opencraw/studio: could not install Chromium automatically. Run "npx playwright install chromium" yourself and try again.', { cause: installError })
    }

    try {
      return await launch()
    } catch (retryError) {
      if (!isMissingBrowserError(retryError)) throw retryError
      throw new Error('@opencraw/studio: Chromium was installed but is still not found. Run "npx playwright install chromium" yourself and try again.', { cause: retryError })
    }
  }
}
