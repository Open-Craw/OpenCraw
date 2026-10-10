import { windowUrl } from './window-url.mapper'

describe('windowUrl', () => {
  it('keeps the token and adds the folder, encoded', () => {
    const url = new URL(windowUrl('http://127.0.0.1:5000/?token=abc', String.raw`C:\my recipes`))

    expect(url.searchParams.get('token')).toBe('abc')
    expect(url.searchParams.get('folder')).toBe(String.raw`C:\my recipes`)
  })

  it('replaces the folder the server was started with', () => {
    const url = new URL(windowUrl('http://127.0.0.1:5000/?token=abc&folder=%2Fold', '/new'))

    expect(url.searchParams.getAll('folder')).toEqual(['/new'])
  })

  it('removes the folder when there is none', () => {
    expect(windowUrl('http://127.0.0.1:5000/?token=abc&folder=%2Fold', undefined)).toBe('http://127.0.0.1:5000/?token=abc')
  })
})
