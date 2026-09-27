import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isRelativeFileUrl, resolveFileUrl, resolveRequestUrl } from './request-url.algorithm'

const folder = join(__dirname, 'recipes')
const inFolder = (path: string): string => pathToFileURL(join(folder, path)).href

describe('isRelativeFileUrl', () => {
  it('tells a relative file: path from an absolute one', () => {
    expect(['file:data/listino.csv', 'file:./x.pdf', 'file:../x.pdf', 'FILE:x.csv'].map(url => isRelativeFileUrl(url))).toEqual([true, true, true, true])
    expect(['file:///tmp/x.pdf', 'file:/tmp/x.pdf', 'file://host/share/x.pdf', 'file:C:/x.pdf', 'https://example.com/x.pdf', './x.pdf'].map(url => isRelativeFileUrl(url))).toEqual([false, false, false, false, false, false])
  })
})

describe('resolveFileUrl', () => {
  it('resolves a relative file: URL against a folder, and leaves any other URL alone', () => {
    expect(resolveFileUrl('file:data/listino.csv', folder)).toBe(inFolder('data/listino.csv'))
    expect(resolveFileUrl('file:./x.pdf', folder)).toBe(inFolder('x.pdf'))
    expect(resolveFileUrl('file:../x.pdf', folder)).toBe(pathToFileURL(join(__dirname, 'x.pdf')).href)
    expect(resolveFileUrl('file:my list.csv', folder)).toBe(inFolder('my list.csv'))
    expect(resolveFileUrl('file:///tmp/x.pdf', folder)).toBe('file:///tmp/x.pdf')
    expect(resolveFileUrl('https://example.com/x', folder)).toBe('https://example.com/x')
  })

  it('keeps a template in the path for later', () => {
    expect(resolveFileUrl('file:data/{{ vars.month }}.csv', folder)).toBe(`${inFolder('data')}/{{ vars.month }}.csv`)
    expect(resolveFileUrl('file:{{ name }}', folder)).toBe(`${pathToFileURL(folder).href}/{{ name }}`)
  })
})

describe('resolveRequestUrl', () => {
  it('resolves a link against the page, and a relative file: URL against the folder', () => {
    expect(resolveRequestUrl('/api?page=2', 'https://shop.example/list', folder)).toBe('https://shop.example/api?page=2')
    expect(resolveRequestUrl('https://other.example/', 'https://shop.example/list', folder)).toBe('https://other.example/')
    expect(resolveRequestUrl('file:x.csv', 'https://shop.example/list', folder)).toBe(inFolder('x.csv'))
    expect(resolveRequestUrl('y.csv', 'file:data/x.csv', folder)).toBe(inFolder('data/y.csv'))
  })

  it('says why a URL that is not one has nowhere to resolve', () => {
    const message = /^"\.\/listino\.csv" is not an absolute URL, and there is no page to resolve it against/
    expect(() => resolveRequestUrl('./listino.csv', undefined, folder)).toThrow(message)
    expect(() => resolveRequestUrl('./listino.csv', '', folder)).toThrow(message)
    expect(() => resolveRequestUrl('./listino.csv', './listino.csv', folder)).toThrow(message)
    expect(() => resolveRequestUrl('./listino.csv', 'about:blank', folder)).toThrow(message)
    expect(() => resolveRequestUrl('x', 'data:text/html,hi', folder)).toThrow('"x" is not a URL and cannot be resolved against data:text/html,hi')
  })
})
