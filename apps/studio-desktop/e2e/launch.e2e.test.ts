import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'

const APP_DIR = join(__dirname, '..')
const MAIN = join(APP_DIR, 'dist', 'main.js')
const UI = join(APP_DIR, '..', '..', 'packages', 'studio', 'dist', 'ui', 'index.html')
const RECIPES = join(APP_DIR, '..', '..', 'packages', 'studio', 'e2e', 'recipes-picking')
// A CI runner has no setuid sandbox helper for Electron, so the tests run there without the OS sandbox. The app never sets this flag.
const SANDBOX_FLAGS = process.env.CI === undefined ? [] : ['--no-sandbox']
const describeBuilt = existsSync(MAIN) && existsSync(UI) ? describe : describe.skip

/** The real app: Electron starts, the Studio server runs in its process, the window shows the built UI. */
describeBuilt('studio desktop: launch', () => {
  let app: ElectronApplication
  let page: Page
  let folder: string
  let userData: string

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'opencraw-desktop-recipes-'))
    userData = mkdtempSync(join(tmpdir(), 'opencraw-desktop-user-'))
    cpSync(RECIPES, folder, { recursive: true })
    app = await electron.launch({ args: [APP_DIR, ...SANDBOX_FLAGS, `--user-data-dir=${userData}`, folder] })
    page = await app.firstWindow()
  })
  afterAll(async () => {
    await app?.close()
    rmSync(folder, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  })

  it('opens the folder given on the command line in the Studio UI', async () => {
    const url = new URL(page.url())

    expect(url.hostname).toBe('127.0.0.1')
    expect(url.searchParams.get('folder')).toBe(folder)
    await page.getByText('Run sample', { exact: true }).first().waitFor()
    await page.locator('option', { hasText: 'books' }).waitFor({ state: 'attached' })
  })

  it('runs the page with no Node access', async () => {
    expect(await page.evaluate('typeof require')).toBe('undefined')
    expect(await page.evaluate('typeof process')).toBe('undefined')
  })

  it('has the File menu with Open Folder', async () => {
    const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map(item => item.label) ?? [])

    expect(labels).toContain('File')
    const file = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.find(item => item.label === 'File')?.submenu?.items.map(item => item.label) ?? [])
    expect(file).toContain('Open Folder…')
  })

  it('refuses to navigate the window away from Studio', async () => {
    const before = page.url()
    await page.evaluate("location.href = 'file:///'")
    await page.waitForTimeout(500)

    expect(page.url()).toBe(before)
  })

  it('remembers the folder for the next launch', () => {
    const remembered: unknown = JSON.parse(readFileSync(join(userData, 'recent-folders.json'), 'utf8'))

    expect(remembered).toEqual([folder])
  })
})

/** The window comes back where the person left it. */
describeBuilt('studio desktop: window place', () => {
  let folder: string
  let userData: string

  const launch = async (): Promise<ElectronApplication> =>
    await electron.launch({ args: [APP_DIR, ...SANDBOX_FLAGS, `--user-data-dir=${userData}`, folder] })

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'opencraw-desktop-recipes-'))
    userData = mkdtempSync(join(tmpdir(), 'opencraw-desktop-user-'))
    cpSync(RECIPES, folder, { recursive: true })
  })
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  })

  it('reopens at the size and place it was closed at', async () => {
    const first = await launch()
    await first.firstWindow()
    await first.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.setBounds({ x: 60, y: 70, width: 900, height: 640 }) })
    await first.close()

    const second = await launch()
    await second.firstWindow()
    const bounds = await second.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds())
    await second.close()

    expect(bounds).toEqual({ x: 60, y: 70, width: 900, height: 640 })
  })
})
