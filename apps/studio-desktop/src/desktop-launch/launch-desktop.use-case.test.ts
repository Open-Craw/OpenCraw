import type { MenuItemSpec } from '../app-menu'
import type { DesktopShell } from './desktop-shell.contract'
import { launchDesktop } from './launch-desktop.use-case'

const SERVER_URL = 'http://127.0.0.1:5000/?token=t'

function fakeShell (chosen?: string) {
  const shown: string[] = []
  const problems: string[] = []
  let menu: readonly MenuItemSpec[] = []
  const shell: DesktopShell = {
    platform:      'win32',
    chooseFolder:  () => Promise.resolve(chosen),
    showWindow:    url => { shown.push(url) },
    focusWindow:   () => undefined,
    setMenu:       items => { menu = items },
    reportProblem: message => { problems.push(message) },
  }

  return { shell, shown, problems, menu: () => menu }
}

function fakeRecent (initial: string[]) {
  const store = { folders: initial }

  return {
    store,
    recent: {
      load: async () => [...store.folders],
      save: async (folders: readonly string[]) => { store.folders = [...folders]; await Promise.resolve() },
    },
  }
}

function folderOf (url: string | undefined): string | null {
  return new URL(url ?? SERVER_URL).searchParams.get('folder')
}

function startStudio () {
  const started: Array<string | undefined> = []
  let closed = false

  return {
    started,
    closed: () => closed,
    start:  async (folder: string | undefined) => {
      started.push(folder)

      return {
        url:   SERVER_URL,
        close: () => {
          closed = true

          return Promise.resolve()
        },
      }
    },
  }
}

describe('launchDesktop', () => {
  it('starts on the folder asked for, ahead of the recent ones', async () => {
    const { shell, shown } = fakeShell()
    const studio = startStudio()
    const { recent, store } = fakeRecent(['/old'])
    await launchDesktop({ shell, startStudio: studio.start, recent, folderExists: async () => true, requestedFolder: '/asked' })

    expect(studio.started).toEqual(['/asked'])
    expect(folderOf(shown[0])).toBe('/asked')
    expect(store.folders).toEqual(['/asked', '/old'])
  })

  it('starts on the most recent folder that still exists', async () => {
    const { shell, shown } = fakeShell()
    const studio = startStudio()
    const { recent } = fakeRecent(['/gone', '/there'])
    await launchDesktop({ shell, startStudio: studio.start, recent, folderExists: async folder => (folder === '/there') })

    expect(studio.started).toEqual(['/there'])
    expect(folderOf(shown[0])).toBe('/there')
  })

  it('shows the window with no folder on a first launch', async () => {
    const { shell, shown } = fakeShell()
    const studio = startStudio()
    await launchDesktop({ shell, startStudio: studio.start, recent: fakeRecent([]).recent, folderExists: async () => true })

    expect(studio.started).toEqual([undefined])
    expect(folderOf(shown[0])).toBeNull()
  })

  it('opens a chosen folder from the menu and remembers it', async () => {
    const { shell, shown, menu } = fakeShell('/chosen')
    const { recent, store } = fakeRecent([])
    await launchDesktop({ shell, startStudio: startStudio().start, recent, folderExists: async () => true })
    const file = menu().find(item => item.label === 'File')
    file?.submenu?.[0]?.action?.()
    await new Promise(resolve => { setTimeout(resolve, 0) })

    expect(folderOf(shown.at(-1))).toBe('/chosen')
    expect(store.folders).toEqual(['/chosen'])
  })

  it('says so and forgets a folder that is gone', async () => {
    const { shell, problems } = fakeShell()
    const { recent, store } = fakeRecent(['/a', '/b'])
    const session = await launchDesktop({ shell, startStudio: startStudio().start, recent, folderExists: async folder => (folder !== '/b') })
    await session.open('/b')

    expect(problems).toHaveLength(1)
    expect(store.folders).toEqual(['/a'])
  })

  it('opens the folder the page asks to choose (the page has no folder box in the desktop app)', async () => {
    const { shell, shown } = fakeShell('/picked')
    const { recent, store } = fakeRecent([])
    const session = await launchDesktop({ shell, startStudio: startStudio().start, recent, folderExists: async () => true })
    await session.chooseFolder()

    expect(folderOf(shown.at(-1))).toBe('/picked')
    expect(store.folders).toEqual(['/picked'])
  })

  it('does nothing when the folder dialog is cancelled', async () => {
    const { shell, shown } = fakeShell(undefined)
    const session = await launchDesktop({ shell, startStudio: startStudio().start, recent: fakeRecent([]).recent, folderExists: async () => true })
    const before = shown.length
    await session.chooseFolder()

    expect(shown).toHaveLength(before)
  })

  it('stops the server when asked', async () => {
    const studio = startStudio()
    const session = await launchDesktop({ shell: fakeShell().shell, startStudio: studio.start, recent: fakeRecent([]).recent, folderExists: async () => true })
    await session.stop()

    expect(studio.closed()).toBe(true)
  })
})
