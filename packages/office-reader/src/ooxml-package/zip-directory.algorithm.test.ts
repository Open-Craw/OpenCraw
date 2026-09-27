import { strToU8, zipSync } from 'fflate'
import { readZipDirectory } from './zip-directory.algorithm'

describe('readZipDirectory', () => {
  it('locates stored and deflated entries, their sizes and where their data starts', () => {
    const bytes = zipSync({ 'stored.txt': [strToU8('plain'), { level: 0 }], 'dir/deflated.xml': strToU8('a'.repeat(1000)) })
    const entries = readZipDirectory(bytes)
    expect(entries.map(({ name, method, originalSize }) => [name, method, originalSize])).toEqual([['stored.txt', 0, 5], ['dir/deflated.xml', 8, 1000]])
    const [stored, deflated] = entries
    expect(new TextDecoder().decode(bytes.subarray(stored.start, stored.start + stored.size))).toBe('plain')
    expect(deflated.size).toBeLessThan(1000)
  })

  it('finds the directory behind an archive comment, and refuses bytes that are not a zip', () => {
    const bytes = zipSync({ 'a.xml': strToU8('<a/>') }, { comment: 'x'.repeat(300) })
    expect(readZipDirectory(bytes).map(entry => entry.name)).toEqual(['a.xml'])
    expect(() => readZipDirectory(strToU8('a,b\n1,2\n'))).toThrow(/invalid zip data/)
  })
})
