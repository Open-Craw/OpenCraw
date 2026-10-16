import { LEARN_LINKS } from './learn-links.config'

describe('LEARN_LINKS', () => {
  it('are all web addresses, each once, each with a label and a description', () => {
    expect(LEARN_LINKS.length).toBeGreaterThan(5)
    expect(new Set(LEARN_LINKS.map(link => link.url)).size).toBe(LEARN_LINKS.length)
    for (const link of LEARN_LINKS) {
      expect(link.url).toMatch(/^https:\/\/github\.com\/Open-Craw\/OpenCraw\//)
      expect(link.label).not.toBe('')
      expect(link.description).not.toBe('')
    }
  })
})
