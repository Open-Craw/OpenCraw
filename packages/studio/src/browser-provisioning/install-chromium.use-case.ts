import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** `playwright`'s own `exports` map doesn't whitelist a `./cli` subpath, so its CLI is resolved off `playwright/package.json`'s real location — the same technique `@opencraw/captcha-tesseract`'s `bundledLangPath()` uses for a bundled data path. */
function playwrightCliPath (): string {
  const require = createRequire(import.meta.url)

  return join(dirname(require.resolve('playwright/package.json')), 'cli.js')
}

async function runPlaywrightInstall (): Promise<void> {
  await execFileAsync(process.execPath, [playwrightCliPath(), 'install', 'chromium'])
}

let installing: Promise<void> | undefined

/**
 * Runs `playwright install chromium` at most once per process. A failed install clears the memo,
 * so the next browser launch attempt retries instead of remembering failure forever.
 */
async function runOnce (run: () => Promise<void>): Promise<void> {
  try {
    await run()
    console.log('@opencraw/studio: Chromium installed.')
  } catch (error) {
    installing = undefined
    console.log('@opencraw/studio: "playwright install chromium" failed.')
    throw error
  }
}

export function installChromiumOnce (run: () => Promise<void> = runPlaywrightInstall): Promise<void> {
  if (installing === undefined) {
    console.log('@opencraw/studio: Playwright\'s Chromium is not downloaded yet — running "playwright install chromium" once...')
    installing = runOnce(run)
  }

  return installing
}
