import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { chromium } from 'playwright'
import type { Browser } from 'playwright'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import { browserConfig, startFixtureSite, stopFixtureSite } from './fixture-site'

const UI_ROOT = join(__dirname, '..', 'dist', 'ui')
const UI_BUILT = existsSync(join(UI_ROOT, 'index.html'))
const describeWithUi = UI_BUILT ? describe : describe.skip

/** The real built UI in a real browser, against the real server: what jsdom unit tests cannot see (issues #153, #155, #159). */
describeWithUi('studio UI smoke: the built UI in a browser', () => {
  let site: Server
  let server: StudioServer
  let browser: Browser
  let folder: string

  beforeAll(async () => {
    site = await startFixtureSite()
    const { executablePath } = browserConfig()
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser?.close()
    await stopFixtureSite(site)
  })
  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-ui-smoke-'))
    cpSync(join(__dirname, 'recipes-picking'), folder, { recursive: true })
    // The starter shape a new recipe has: a goto, then a closing emit.
    const file = join(folder, 'books.input.json')
    const recipe = JSON.parse(readFileSync(file, 'utf8')) as { steps: unknown[] }
    recipe.steps = [{ type: 'goto', url: '{{start.url}}' }, { type: 'emit' }]
    writeFileSync(file, JSON.stringify(recipe))
    server = await startStudioServer({ uiRoot: UI_ROOT, initialFolder: folder, browser: browserConfig() })
  })
  afterEach(async () => { await server.close() })

  it('picks a clicked element in the snapshot (cross-realm elements) and puts the Read before the closing emit', async () => {
    const page = await browser.newPage()
    await page.goto(server.url)
    await page.getByText('Read', { exact: true }).first().waitFor()
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('a') != null)

    await page.getByText('Read', { exact: true }).first().click()
    await page.frameLocator('iframe').first().getByText('Book 1', { exact: true }).click()
    await page.getByText(/Read card:/).waitFor()

    // The click was a pick: the snapshot did not navigate away, and the card was saved ahead of the emit.
    expect(await page.evaluate("document.querySelector('iframe')?.contentDocument?.location.href")).toBe('about:srcdoc')
    await page.getByText('value', { exact: true }).first().waitFor()
    const written = JSON.parse(readFileSync(join(folder, 'books.input.json'), 'utf8')) as { steps: { type: string }[] }
    expect(written.steps.map(step => step.type)).toEqual(['goto', 'extract', 'emit'])
    await page.close()
  })

  it('refreshes the start snapshot when an edit changes the start point (new start URL in the recipe JSON)', async () => {
    const page = await browser.newPage()
    await page.goto(server.url)
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('article') != null)

    const recipe = { kind: 'input', id: 'books', output: 'book', mode: 'web', start: [{ url: 'http://127.0.0.1:4599/login' }], steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'emit' }], mapping: {} }
    const saved = await fetch(`${new URL(server.url).origin}/api/command`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', 'x-opencraw-token': server.token },
      body:    JSON.stringify({ type: 'save-recipe', path: join(folder, 'books.input.json'), recipe }),
    })
    expect(saved.status).toBe(200)

    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('form') != null)
    await page.close()
  })
})
