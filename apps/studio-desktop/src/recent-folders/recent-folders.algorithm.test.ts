import { forgetFolder, rememberFolder } from './recent-folders.algorithm'

describe('rememberFolder', () => {
  it('puts the folder first and keeps the rest in order', () => {
    expect(rememberFolder(['b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
  })

  it('moves a folder that is already there instead of listing it twice', () => {
    expect(rememberFolder(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('drops the oldest past the limit', () => {
    expect(rememberFolder(['b', 'c'], 'a', 2)).toEqual(['a', 'b'])
  })
})

describe('forgetFolder', () => {
  it('removes only that folder', () => {
    expect(forgetFolder(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})
