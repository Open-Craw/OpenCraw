import { chooseFolderWithDialog } from './choose-folder.client'
import type { DialogRun } from './choose-folder.client'

describe('chooseFolderWithDialog', () => {
  it('answers the folder the dialog printed', async () => {
    const folder = await chooseFolderWithDialog('linux', () => Promise.resolve({ output: '/home/ana/recipes\n' }))

    expect(folder).toBe('/home/ana/recipes')
  })

  it('answers nothing when the dialog was closed', async () => {
    const folder = await chooseFolderWithDialog('linux', () => Promise.resolve({ cancelled: true }))

    expect(folder).toBeUndefined()
  })

  it('tries the next program when the first is not installed', async () => {
    const asked: string[] = []
    const folder = await chooseFolderWithDialog('linux', command => {
      asked.push(command.file)
      const run: DialogRun = command.file === 'zenity' ? { missing: true } : { output: '/srv/recipes' }

      return Promise.resolve(run)
    })

    expect(asked).toEqual(['zenity', 'kdialog'])
    expect(folder).toBe('/srv/recipes')
  })

  it('does not try the next program after a cancel', async () => {
    const asked: string[] = []
    await chooseFolderWithDialog('linux', command => {
      asked.push(command.file)

      return Promise.resolve({ cancelled: true })
    })

    expect(asked).toEqual(['zenity'])
  })

  it('says what is missing when no program is installed', async () => {
    await expect(chooseFolderWithDialog('linux', () => Promise.resolve({ missing: true }))).rejects.toThrow('zenity or kdialog is not installed')
  })

  it('says there is no dialog on a platform without one', async () => {
    await expect(chooseFolderWithDialog('aix', () => Promise.resolve({ missing: true }))).rejects.toThrow('no folder dialog')
  })
})
