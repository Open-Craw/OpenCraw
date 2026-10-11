import { openTargetFor } from './open-target.algorithm'

describe('openTargetFor', () => {
  it('names the workspace folder that holds the file', () => {
    expect(openTargetFor('/work/recipes/docs/report.pdf', ['/work/recipes'])).toEqual({ open: '/work/recipes/docs/report.pdf', workspace: '/work/recipes' })
  })

  it('names the folder itself as its workspace when it is a workspace folder', () => {
    expect(openTargetFor('/work/recipes', ['/work/recipes'])).toEqual({ open: '/work/recipes', workspace: '/work/recipes' })
  })

  it('picks the deepest of nested workspace folders', () => {
    expect(openTargetFor('/work/a/b/file.csv', ['/work/a', '/work/a/b'])).toEqual({ open: '/work/a/b/file.csv', workspace: '/work/a/b' })
  })

  it('has no workspace for a file outside every workspace folder', () => {
    expect(openTargetFor('/elsewhere/file.csv', ['/work/recipes'])).toEqual({ open: '/elsewhere/file.csv' })
  })

  it('does not take a folder that only shares a name prefix', () => {
    expect(openTargetFor('/work/recipes-old/file.csv', ['/work/recipes'])).toEqual({ open: '/work/recipes-old/file.csv' })
  })

  it('compares Windows paths regardless of drive letter case and separators', () => {
    expect(openTargetFor(String.raw`c:\Users\ana\recipes\a.csv`, [String.raw`C:\Users\ana\recipes`])).toEqual({ open: String.raw`c:\Users\ana\recipes\a.csv`, workspace: String.raw`C:\Users\ana\recipes` })
  })

  it('has no workspace when the editor has none open', () => {
    expect(openTargetFor('/work/file.csv', [])).toEqual({ open: '/work/file.csv' })
  })
})
