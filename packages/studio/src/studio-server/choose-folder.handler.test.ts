import { handleChooseFolder } from './choose-folder.handler'
import { createStudioState } from './workspace.store'

describe('handleChooseFolder', () => {
  it('answers the folder the dialog gave', async () => {
    const state = createStudioState()
    state.chooseFolder = () => Promise.resolve('/home/ana/recipes')

    expect(await handleChooseFolder(state)).toEqual({ folder: '/home/ana/recipes' })
  })

  it('answers no folder when the dialog was closed', async () => {
    const state = createStudioState()
    state.chooseFolder = () => Promise.resolve(undefined)

    expect(await handleChooseFolder(state)).toEqual({})
  })

  it('opens one dialog for two requests that overlap', async () => {
    const state = createStudioState()
    let opened = 0
    state.chooseFolder = async () => {
      opened += 1
      await Promise.resolve()

      return '/srv/recipes'
    }

    const first = handleChooseFolder(state)
    const second = handleChooseFolder(state)

    expect(await Promise.all([first, second])).toEqual([{ folder: '/srv/recipes' }, { folder: '/srv/recipes' }])
    expect(opened).toBe(1)
  })

  it('opens a new dialog after the first one is answered', async () => {
    const state = createStudioState()
    let opened = 0
    state.chooseFolder = () => {
      opened += 1

      return Promise.resolve('/srv/recipes')
    }

    await handleChooseFolder(state)
    await handleChooseFolder(state)

    expect(opened).toBe(2)
  })

  it('explains when the server has no dialog', async () => {
    await expect(handleChooseFolder(createStudioState())).rejects.toThrow('type the folder instead')
  })
})
