import { folderDialogCommands, folderFromDialogOutput } from './folder-dialog.algorithm'

describe('folderDialogCommands', () => {
  it('uses PowerShell on Windows', () => {
    expect(folderDialogCommands('win32').map(command => command.file)).toEqual(['powershell.exe'])
  })

  it('uses osascript on macOS', () => {
    expect(folderDialogCommands('darwin').map(command => command.file)).toEqual(['osascript'])
  })

  it('tries zenity, then kdialog, on Linux', () => {
    expect(folderDialogCommands('linux').map(command => command.file)).toEqual(['zenity', 'kdialog'])
  })

  it('knows no dialog for a platform it has not heard of', () => {
    expect(folderDialogCommands('aix')).toEqual([])
  })
})

describe('folderFromDialogOutput', () => {
  it('drops the line break', () => {
    expect(folderFromDialogOutput('/home/ana/recipes\n')).toBe('/home/ana/recipes')
  })

  it('drops the trailing separator osascript adds', () => {
    expect(folderFromDialogOutput('/Users/ana/recipes/\n')).toBe('/Users/ana/recipes')
  })

  it('keeps a Windows path as printed', () => {
    expect(folderFromDialogOutput(String.raw`C:\Users\ana\recipes`)).toBe(String.raw`C:\Users\ana\recipes`)
  })

  it('keeps a root as it is', () => {
    expect(folderFromDialogOutput('/\n')).toBe('/')
    expect(folderFromDialogOutput('C:\\')).toBe('C:\\')
  })

  it('reads nothing as a cancelled dialog', () => {
    expect(folderFromDialogOutput('')).toBeUndefined()
    expect(folderFromDialogOutput('\n')).toBeUndefined()
  })
})
