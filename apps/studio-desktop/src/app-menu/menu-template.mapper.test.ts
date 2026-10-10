import type { MenuActions, MenuItemSpec } from './menu-item.contract'
import { menuTemplate } from './menu-template.mapper'

function actions (): MenuActions & { calls: string[] } {
  const calls: string[] = []

  return {
    calls,
    openFolder:  () => { calls.push('open') },
    openRecent:  folder => { calls.push(`recent ${folder}`) },
    clearRecent: () => { calls.push('clear') },
  }
}

function submenuOf (items: readonly MenuItemSpec[], label: string): readonly MenuItemSpec[] {
  return items.find(item => item.label === label)?.submenu ?? []
}

describe('menuTemplate', () => {
  it('opens a folder from File with the platform shortcut', () => {
    const handlers = actions()
    const open = submenuOf(menuTemplate('win32', [], handlers), 'File')[0]

    expect(open?.accelerator).toBe('CmdOrCtrl+O')
    open?.action?.()
    expect(handlers.calls).toEqual(['open'])
  })

  it('lists recent folders, most recent first, and calls back with the folder', () => {
    const handlers = actions()
    const recent = submenuOf(submenuOf(menuTemplate('linux', ['/b', '/a'], handlers), 'File'), 'Open Recent')

    expect(recent.map(item => item.label)).toEqual(['/b', '/a', undefined, 'Clear recent folders'])
    recent[1]?.action?.()
    recent[3]?.action?.()
    expect(handlers.calls).toEqual(['recent /a', 'clear'])
  })

  it('says there are none when nothing was opened yet', () => {
    const file = submenuOf(menuTemplate('linux', [], actions()), 'File')
    const recent = submenuOf(file, 'Open Recent')

    expect(recent).toEqual([{ label: 'No recent folders', enabled: false }])
  })

  it('puts the app menu first on macOS only', () => {
    expect(menuTemplate('darwin', [], actions())[0]?.label).toBe('OpenCraw Studio')
    expect(menuTemplate('win32', [], actions())[0]?.label).toBe('File')
  })

  it('has Quit in File outside macOS', () => {
    const file = submenuOf(menuTemplate('win32', [], actions()), 'File')

    expect(file.at(-1)?.role).toBe('quit')
  })
})
