import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Server } from 'node:http'
import { httpHook } from '@opencraw/core'
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
  it('shows why a run could not start (an unknown hook) and keeps the server up (issues #148, #150)', async () => {
    const file = join(folder, 'books.input.json')
    const recipe = JSON.parse(readFileSync(file, 'utf8')) as { steps: unknown[], mapping: Record<string, unknown> }
    recipe.steps = [{ type: 'goto', url: '{{start.url}}' }, { type: 'extract', id: 'value', selector: '.price_color', kind: 'css' }, { type: 'emit' }]
    recipe.mapping = { price: { from: 'value', transform: [{ op: 'hook', name: 'positive' }] } }
    writeFileSync(file, JSON.stringify(recipe))
    const page = await browser.newPage()
    await page.goto(server.url)
    await page.getByRole('button', { name: 'Run sample' }).click()

    await page.getByText(/Studio was started without hooks/).waitFor()
    await page.getByRole('button', { name: 'Run sample' }).waitFor()
    expect(await page.getByRole('button', { name: 'Run sample' }).isEnabled()).toBe(true)
    const stillUp = await fetch(`${new URL(server.url).origin}/api/command`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', 'x-opencraw-token': server.token },
      body:    JSON.stringify({ type: 'open-workspace', folder }),
    })
    expect(stillUp.status).toBe(200)
    await page.close()
  })

  it('adds a Hook step and picks its name from the hooks Studio was started with (issue #202)', async () => {
    const withHooks = await startStudioServer({
      uiRoot:        UI_ROOT,
      initialFolder: folder,
      browser:       browserConfig(),
      plugins:       { source: 'hooks.mjs', hooks: { positive: (value: unknown) => value, slug: (value: unknown) => value } },
    })
    const page = await browser.newPage()
    try {
      page.setDefaultTimeout(8000)
      await page.goto(withHooks.url)
      await page.getByText(/Hooks loaded from hooks.mjs/).waitFor()

      await page.getByLabel(/after this step/).first().selectOption({ label: 'Hook' })
      await page.getByTestId('outline-card-steps.1').getByText('Run hook').click()
      await page.getByLabel('hook', { exact: true }).selectOption('slug')

      const steps = async (): Promise<{ type: string, name?: string }[]> => (JSON.parse(readFileSync(join(folder, 'books.input.json'), 'utf8')) as { steps: { type: string, name?: string }[] }).steps
      let written = await steps()
      for (let attempt = 0; attempt < 50 && written[1]?.name !== 'slug'; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
        written = await steps()
      }
      expect(written).toEqual([{ type: 'goto', url: '{{start.url}}' }, { type: 'hook', name: 'slug' }, { type: 'emit' }])
    } finally {
      await page.close()
      await withHooks.close()
    }
  }, 60000)

  it('says which hooks call outside the machine, and answers a stubbed one without calling it (issue #201)', async () => {
    const data = join(folder, 'data.json')
    writeFileSync(data, JSON.stringify({ items: [{ price: '1' }] }))
    const file = join(folder, 'books.input.json')
    const recipe = {
      kind:   'input',
      id:     'books',
      output: 'book',
      mode:   'api',
      start:  [{ url: pathToFileURL(data).href }],
      steps:  [
        { type: 'request', id: 'list', url: '{{start.url}}', as: 'json' },
        { type: 'extract', id: 'entries', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
        { type: 'forEach', over: 'entries', as: 'item', emit: true, steps: [] },
      ],
      mapping: { price: { from: 'item.price', transform: [{ op: 'hook', name: 'quote' }] } },
    }
    writeFileSync(file, JSON.stringify(recipe))
    // Nothing listens on this port: the run only works because the hook is stubbed.
    const remote = await startStudioServer({
      uiRoot:        UI_ROOT,
      initialFolder: folder,
      browser:       browserConfig(),
      plugins:       { source: 'hooks.mjs', hooks: { quote: httpHook('quote', 'http://127.0.0.1:1/quote', { timeoutMs: 200, maxWaitMs: 1 }) } },
    })
    const page = await browser.newPage()
    try {
      page.setDefaultTimeout(8000)
      await page.goto(remote.url)
      await page.getByText(/call outside this machine/).waitFor()
      expect(await page.getByTestId('remote-quote').textContent()).toContain('POST http://127.0.0.1:1/quote')

      await page.getByText('stub quote', { exact: true }).click()
      await page.getByLabel('stub value of quote').fill('"stubbed-9"')
      await page.getByRole('button', { name: 'Run sample' }).click()

      await page.getByText(/hook "quote" is stubbed/).first().waitFor({ state: 'attached' })
      await page.getByText('stubbed-9').first().waitFor()
    } finally {
      await page.close()
      await remote.close()
    }
  }, 60000)

  it('builds the per-item record loop from a JSON list pick, with ids the engine accepts (issues #163, #164)', async () => {
    const file = join(folder, 'books.input.json')
    const recipe = { kind: 'input', id: 'books', output: 'book', mode: 'api', start: [{ url: 'http://127.0.0.1:4599/products' }], steps: [{ type: 'request', id: 'response', url: '{{start.url}}', as: 'json' }], mapping: {} }
    writeFileSync(file, JSON.stringify(recipe))
    const page = await browser.newPage()
    await page.goto(server.url)
    await page.getByText('Click a value to read it').waitFor()

    const nameRow = page.locator('div', { has: page.getByText('Widget', { exact: true }) }).last()
    await nameRow.getByText('[*]').first().click()
    await page.getByText(/List: /).waitFor()
    const priceRow = page.locator('div', { has: page.getByText('9.5', { exact: true }) }).last()
    await priceRow.getByText('[*]').first().click()
    await page.getByText(/Added to the list/).waitFor()

    const written = JSON.parse(readFileSync(file, 'utf8')) as { steps: { type: string, over?: string, steps?: { id: string, selector: string }[] }[] }
    expect(written.steps.map(step => step.type)).toEqual(['request', 'extract', 'forEach'])
    expect(written.steps[2].steps?.map(step => [step.id, step.selector])).toEqual([['value', '$.name'], ['value_2', '$.price']])
    await page.close()
  })

  it('Record opens the recorder window, shows the banner, and Stop leaves a stopped bar with nothing to keep (issue #95)', async () => {
    const page = await browser.newPage()
    await page.goto(server.url)
    await page.getByText('Read', { exact: true }).first().waitFor()

    await page.getByText('Record', { exact: true }).first().click()
    await page.getByTestId('recording-banner').waitFor()
    await page.getByText('Stop recording', { exact: true }).click()

    const bar = page.getByTestId('recording-stopped-bar')
    await bar.waitFor()
    await bar.getByText(/0 steps recorded/).waitFor()
    expect(await bar.getByRole('button', { name: 'Keep as steps' }).isDisabled()).toBe(true)
    await bar.getByRole('button', { name: 'Discard' }).click()
    await bar.waitFor({ state: 'detached' })
    await page.close()
  }, 60000)

  it('keeps the PDF page where it is while a line is picked and added to the recipe (issue #190)', async () => {
    const pdf = join(__dirname, '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')
    const recipe = { kind: 'input', id: 'books', output: 'book', mode: 'api', start: [{ url: pathToFileURL(pdf).href }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }], mapping: {} }
    writeFileSync(join(folder, 'books.input.json'), JSON.stringify(recipe))
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.goto(server.url)
    const overlay = page.getByTestId('pdf-overlay')
    await overlay.waitFor()
    const top = async (): Promise<number> => {
      const box = await overlay.boundingBox()

      return box?.y ?? NaN
    }
    const before = await top()

    await page.getByText('Text', { exact: true }).first().click()
    const box = await overlay.boundingBox()
    await page.mouse.click((box?.x ?? 0) + 100, (box?.y ?? 0) + 80)
    await page.getByRole('button', { name: 'Add to recipe' }).waitFor()
    expect(await top()).toBe(before)

    await page.getByRole('button', { name: 'Add to recipe' }).click()
    await page.getByText(/^region:/).waitFor()
    expect(await top()).toBe(before)
    await page.close()
  }, 60000)
})
