import { progressMessage, recordCount } from './run-progress.algorithm'

describe('progressMessage', () => {
  it('is the last non-empty line the run wrote, trimmed', () => {
    expect(progressMessage('first\n  GET https://x.test/a  \n\n')).toBe('GET https://x.test/a')
    expect(progressMessage('only line')).toBe('only line')
  })

  it('shortens a long line and says nothing for an empty chunk', () => {
    const message = progressMessage('x'.repeat(200))
    expect(message).toHaveLength(90)
    expect(message?.endsWith('…')).toBe(true)
    expect(progressMessage('\n \n')).toBeUndefined()
  })
})

describe('recordCount', () => {
  it('counts the non-empty lines of a JSON Lines file', () => {
    expect(recordCount('{"a":1}\n{"a":2}\n\n')).toBe(2)
    expect(recordCount('')).toBe(0)
  })
})
